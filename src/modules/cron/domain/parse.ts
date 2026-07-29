import {
    CRON_MACROS,
    type CronExpression,
    type CronField,
    type CronFailure,
    type CronFailureReason,
    type CronFieldName,
    type CronMacro,
    type CronTerm,
    type CronWeekdayBase,
    type ParseCronResult,
} from "../types";
import {
    FIELD_RANGES,
    MACRO_EXPANSIONS,
    MAX_EXPRESSION_LENGTH,
    MONTH_NAMES,
    WEEKDAY_NAMES,
} from "./constants";

/**
 * A cron line, read into value sets.
 *
 * Two decisions shape everything below.
 *
 * The **day-of-week column is normalised to 0–6, Sunday first**, whatever the
 * source numbering was. Unix crontab counts Sunday as 0 and accepts 7 as a
 * second spelling of it; Quartz counts Sunday as 1. Absorbing that here means
 * the describer and the scheduler only ever see one numbering — and it is why
 * `0-7` comes back out as Sunday-through-Saturday rather than as a range whose
 * two ends are the same day.
 *
 * **Nothing throws.** Every way a person can mistype a schedule comes back as a
 * typed failure naming the column and quoting the term, because the tool's job
 * is to explain the mistake rather than to report that one happened.
 */

type FieldSpec = {
    readonly name: CronFieldName;
    /** Widest value the *source* may write, which is not the normalised range. */
    readonly min: number;
    readonly max: number;
    /** `L`, `LW`, `L-n` and `nW`. */
    readonly calendarDays: boolean;
    /** `nL` and `n#m`. */
    readonly calendarWeekdays: boolean;
    /** Quartz's `?`, meaning "left to the other day column". */
    readonly unspecifiable: boolean;
};

function fieldSpec(name: CronFieldName, base: CronWeekdayBase): FieldSpec {
    if (name === "dayOfWeek") {
        return {
            name,
            // Unix accepts a bare 7 for Sunday; Quartz starts counting at 1.
            min: base === "quartz" ? 1 : 0,
            max: 7,
            calendarDays: false,
            calendarWeekdays: true,
            unspecifiable: true,
        };
    }

    return {
        name,
        ...FIELD_RANGES[name],
        calendarDays: name === "dayOfMonth",
        calendarWeekdays: false,
        unspecifiable: name === "dayOfMonth",
    };
}

/** Source numbering to the 0–6 the rest of the module speaks. */
function normalizeWeekday(value: number, base: CronWeekdayBase): number {
    return base === "quartz" ? value - 1 : value % 7;
}

type ValueResult =
    | { readonly ok: true; readonly value: number }
    | { readonly ok: false; readonly reason: CronFailureReason };

/**
 * Reads one number or three-letter name, in the source's own numbering. Names
 * are anchored to the base too, so `SUN` is 0 under unix and 1 under Quartz and
 * one normalisation then covers both.
 */
function readValue(spec: FieldSpec, token: string, base: CronWeekdayBase): ValueResult {
    const text = token.toUpperCase();

    if (spec.name === "month") {
        const named = MONTH_NAMES.indexOf(text);

        if (named !== -1) {
            return { ok: true, value: named + 1 };
        }
    }

    if (spec.name === "dayOfWeek") {
        const named = WEEKDAY_NAMES.indexOf(text);

        if (named !== -1) {
            return { ok: true, value: named + (base === "quartz" ? 1 : 0) };
        }
    }

    if (!/^\d{1,4}$/.test(text)) {
        return { ok: false, reason: "invalid_term" };
    }

    const value = Number.parseInt(text, 10);

    return value >= spec.min && value <= spec.max
        ? { ok: true, value }
        : { ok: false, reason: "out_of_range" };
}

type TermResult =
    | { readonly ok: true; readonly term: CronTerm }
    | { readonly ok: false; readonly reason: CronFailureReason };

/**
 * True for anything wearing Quartz's calendar syntax. Used to tell "you put an
 * `L` in the hour column" apart from "that is not a number at all" — note that
 * `WED` ends in D, so no weekday name trips it.
 */
function looksCalendarRelative(token: string): boolean {
    return token.includes("#") || /^L/i.test(token) || /L$/i.test(token) || /W$/i.test(token);
}

function parseCalendarDayTerm(
    spec: FieldSpec,
    token: string,
    base: CronWeekdayBase,
): TermResult | null {
    const text = token.toUpperCase();

    if (text === "L") {
        return { ok: true, term: { kind: "lastDayOfMonth", offset: 0 } };
    }

    if (text === "LW") {
        return { ok: true, term: { kind: "lastWeekday" } };
    }

    const offsetFromLast = /^L-(\d{1,2})$/.exec(text);

    if (offsetFromLast !== null) {
        const offset = Number.parseInt(offsetFromLast[1], 10);

        // 30 back from the last day of a 31-day month still lands on the 1st.
        return offset <= 30
            ? { ok: true, term: { kind: "lastDayOfMonth", offset } }
            : { ok: false, reason: "out_of_range" };
    }

    const nearest = /^(\d{1,2})W$/.exec(text);

    if (nearest !== null) {
        const day = readValue(spec, nearest[1], base);

        return day.ok
            ? { ok: true, term: { kind: "nearestWeekday", day: day.value } }
            : { ok: false, reason: day.reason };
    }

    return null;
}

function parseCalendarWeekdayTerm(
    spec: FieldSpec,
    token: string,
    base: CronWeekdayBase,
): TermResult | null {
    const text = token.toUpperCase();
    const last = /^([A-Z0-9]{1,3})L$/.exec(text);

    if (last !== null) {
        const weekday = readValue(spec, last[1], base);

        return weekday.ok
            ? { ok: true, term: { kind: "lastWeekdayOfMonth", weekday: weekday.value } }
            : { ok: false, reason: weekday.reason };
    }

    const nth = /^([A-Z0-9]{1,3})#(\d{1,2})$/.exec(text);

    if (nth !== null) {
        const weekday = readValue(spec, nth[1], base);

        if (!weekday.ok) {
            return { ok: false, reason: weekday.reason };
        }

        const ordinal = Number.parseInt(nth[2], 10);

        // No month holds a sixth Friday: 5 × 7 = 35 is already past 31.
        return ordinal >= 1 && ordinal <= 5
            ? { ok: true, term: { kind: "nthWeekday", weekday: weekday.value, nth: ordinal } }
            : { ok: false, reason: "invalid_nth" };
    }

    return null;
}

function parseTerm(spec: FieldSpec, token: string, base: CronWeekdayBase): TermResult {
    if (token.length === 0) {
        return { ok: false, reason: "empty_term" };
    }

    if (spec.calendarDays) {
        const calendar = parseCalendarDayTerm(spec, token, base);

        if (calendar !== null) {
            return calendar;
        }
    }

    if (spec.calendarWeekdays) {
        const calendar = parseCalendarWeekdayTerm(spec, token, base);

        if (calendar !== null) {
            return calendar;
        }
    }

    const slices = token.split("/");

    if (slices.length > 2) {
        return { ok: false, reason: "invalid_step" };
    }

    const body = slices[0];
    let step = 1;

    if (slices.length === 2) {
        if (!/^\d{1,4}$/.test(slices[1])) {
            return { ok: false, reason: "invalid_step" };
        }

        step = Number.parseInt(slices[1], 10);

        if (step < 1) {
            return { ok: false, reason: "invalid_step" };
        }
    }

    if (body === "*") {
        return { ok: true, term: { kind: "all", step } };
    }

    const dash = body.indexOf("-");

    if (dash > 0) {
        const from = readValue(spec, body.slice(0, dash), base);

        if (!from.ok) {
            return { ok: false, reason: from.reason };
        }

        const to = readValue(spec, body.slice(dash + 1), base);

        if (!to.ok) {
            return { ok: false, reason: to.reason };
        }

        // Cron ranges do not wrap: `FRI-MON` has to be written `FRI,SAT,SUN,MON`.
        return from.value <= to.value
            ? { ok: true, term: { kind: "range", from: from.value, to: to.value, step } }
            : { ok: false, reason: "reversed_range" };
    }

    const single = readValue(spec, body, base);

    if (!single.ok) {
        return {
            ok: false,
            reason:
                single.reason === "invalid_term" && looksCalendarRelative(body)
                    ? "unsupported_syntax"
                    : single.reason,
        };
    }

    // `5/15` is Quartz's "from 5, then every 15th" — an open-ended range.
    return step > 1
        ? { ok: true, term: { kind: "range", from: single.value, to: spec.max, step } }
        : { ok: true, term: { kind: "single", value: single.value } };
}

/**
 * Rewrites a day-of-week term into the internal 0–6 numbering. A range has to
 * be expanded to do it: under unix numbering `5-7` covers Friday, Saturday and
 * Sunday, which is no longer one contiguous run once Sunday is 0.
 */
function normalizeWeekdayTerm(term: CronTerm, base: CronWeekdayBase): readonly CronTerm[] {
    switch (term.kind) {
        case "single":
            return [{ kind: "single", value: normalizeWeekday(term.value, base) }];
        case "lastWeekdayOfMonth":
            return [{ kind: "lastWeekdayOfMonth", weekday: normalizeWeekday(term.weekday, base) }];
        case "nthWeekday":
            return [
                {
                    kind: "nthWeekday",
                    weekday: normalizeWeekday(term.weekday, base),
                    nth: term.nth,
                },
            ];
        case "range": {
            const values = new Set<number>();

            for (let value = term.from; value <= term.to; value += term.step) {
                values.add(normalizeWeekday(value, base));
            }

            const sorted = [...values].toSorted((a, b) => a - b);
            const contiguous = sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;

            if (term.step === 1 && sorted.length > 1 && contiguous) {
                return [{ kind: "range", from: sorted[0], to: sorted[sorted.length - 1], step: 1 }];
            }

            return sorted.map((value) => ({ kind: "single", value }) satisfies CronTerm);
        }
        default:
            // `*` and `*/n` already span the week whichever end it starts at.
            return [term];
    }
}

function expandTerm(name: CronFieldName, term: CronTerm): readonly number[] {
    const { min, max } = FIELD_RANGES[name];
    const collect = (from: number, to: number, step: number) => {
        const values: number[] = [];

        for (let value = from; value <= to; value += step) {
            values.push(value);
        }

        return values;
    };

    switch (term.kind) {
        case "all":
            return collect(min, max, term.step);
        case "range":
            return collect(term.from, Math.min(term.to, max), term.step);
        case "single":
            return [term.value];
        default:
            // Calendar-relative terms depend on the month, so they contribute
            // no fixed values and are tested against each candidate date.
            return [];
    }
}

function buildField(name: CronFieldName, raw: string, terms: readonly CronTerm[]): CronField {
    const values = new Set<number>();

    for (const term of terms) {
        for (const value of expandTerm(name, term)) {
            values.add(value);
        }
    }

    return {
        name,
        raw,
        star: raw.startsWith("*"),
        unspecified: false,
        terms,
        values: [...values].toSorted((a, b) => a - b),
    };
}

function parseField(
    name: CronFieldName,
    raw: string,
    base: CronWeekdayBase,
): { readonly ok: true; readonly field: CronField } | CronFailure {
    const spec = fieldSpec(name, base);
    const trimmed = raw.trim();

    if (trimmed === "?") {
        if (!spec.unspecifiable) {
            return { ok: false, reason: "unsupported_syntax", field: name, token: trimmed };
        }

        return {
            ok: true,
            field: {
                ...buildField(name, trimmed, [{ kind: "all", step: 1 }]),
                star: true,
                unspecified: true,
            },
        };
    }

    const terms: CronTerm[] = [];

    for (const token of trimmed.split(",")) {
        const parsed = parseTerm(spec, token.trim(), base);

        if (!parsed.ok) {
            return { ok: false, reason: parsed.reason, field: name, token: token.trim() };
        }

        terms.push(
            ...(name === "dayOfWeek" ? normalizeWeekdayTerm(parsed.term, base) : [parsed.term]),
        );
    }

    return { ok: true, field: buildField(name, trimmed, terms) };
}

/** Which column each position holds, by how many were typed. */
const FIELD_ORDERS: Readonly<Record<number, readonly CronFieldName[]>> = {
    5: ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"],
    6: ["second", "minute", "hour", "dayOfMonth", "month", "dayOfWeek"],
    7: ["second", "minute", "hour", "dayOfMonth", "month", "dayOfWeek", "year"],
};

function readMacro(text: string): CronMacro | null {
    const match = /^@([a-z]+)$/i.exec(text);

    if (match === null) {
        return null;
    }

    const name = match[1].toLowerCase();

    return CRON_MACROS.find((macro) => macro === name) ?? null;
}

/** `@reboot` fires once at boot, so it has no columns and no next run. */
function rebootExpression(source: string, base: CronWeekdayBase): CronExpression {
    const blank = (name: CronFieldName): CronField => ({
        name,
        raw: "—",
        star: false,
        unspecified: false,
        terms: [],
        values: [],
    });

    return {
        ok: true,
        source,
        fieldCount: 0,
        macro: "reboot",
        reboot: true,
        hasSeconds: false,
        weekdayBase: base,
        fields: {
            second: blank("second"),
            minute: blank("minute"),
            hour: blank("hour"),
            dayOfMonth: blank("dayOfMonth"),
            month: blank("month"),
            dayOfWeek: blank("dayOfWeek"),
            year: blank("year"),
        },
    };
}

export type ParseCronRequest = {
    readonly expression: string;
    readonly weekdayBase: CronWeekdayBase;
};

/** The one parse the whole tool runs, server render and settled keystroke alike. */
export function parseCron(request: ParseCronRequest): ParseCronResult {
    const source = request.expression.trim().replaceAll(/\s+/g, " ");

    if (source.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (source.length > MAX_EXPRESSION_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    let macro: CronMacro | undefined;
    let body = source;

    if (source.startsWith("@")) {
        const found = readMacro(source);

        if (found === null) {
            return { ok: false, reason: "unknown_macro", token: source };
        }

        if (found === "reboot") {
            return rebootExpression(source, request.weekdayBase);
        }

        macro = found;
        body = MACRO_EXPANSIONS[found];
    }

    const parts = body.split(" ");
    const order = FIELD_ORDERS[parts.length];

    if (order === undefined) {
        return { ok: false, reason: "field_count", token: source };
    }

    // Columns the dialect leaves out still exist downstream: a five-field line
    // fires on the zeroth second, of every year it is left running.
    const raws: Record<CronFieldName, string> = {
        second: "0",
        minute: "*",
        hour: "*",
        dayOfMonth: "*",
        month: "*",
        dayOfWeek: "*",
        year: "*",
    };

    for (const [index, name] of order.entries()) {
        raws[name] = parts[index];
    }

    const fields: Partial<Record<CronFieldName, CronField>> = {};

    for (const name of Object.keys(raws) as CronFieldName[]) {
        const parsed = parseField(name, raws[name], request.weekdayBase);

        if (!parsed.ok) {
            return parsed;
        }

        fields[name] = parsed.field;
    }

    return {
        ok: true,
        source,
        fieldCount: parts.length,
        macro,
        reboot: false,
        hasSeconds: order.length >= 6,
        weekdayBase: request.weekdayBase,
        fields: fields as Record<CronFieldName, CronField>,
    };
}
