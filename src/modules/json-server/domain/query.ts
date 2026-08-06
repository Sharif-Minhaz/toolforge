import { DEFAULT_PER_PAGE, MAX_PER_PAGE, MAX_WHERE_DEPTH, MAX_WHERE_LENGTH } from "./constants";
import { isPlainObject } from "./document";
import type { JsonObject, JsonValue } from "../types";

/**
 * `json-server` v1's query language, as a pure function of a list and a query
 * string.
 *
 * Every operator here is spelled the way the reference spells it, and the ones
 * that look arbitrary are the ones worth not "improving":
 *
 * - **`field:operator=value`, with no operator meaning `eq`.** So `?views=100`
 *   and `?views:eq=100` are the same query, and `?views:gt=100` is the other
 *   one. A dotted field descends — `?author.name:eq=typicode`.
 * - **A query value is coerced by its own literal shape**, not against the field
 *   it is compared to — see `coerce`. This is the rule most worth not
 *   "improving": the obvious alternative reads better and makes this server
 *   disagree with a local `json-server` on the same document.
 * - **`contains`, `startsWith` and `endsWith` are case-insensitive**, and the
 *   comparisons are not. That is the reference's behaviour and it is the useful
 *   one — a text search nobody has to think about case for, and a sort that is
 *   stable.
 *
 * The whole file is a pure function so the operator table is unit-testable
 * against the shapes that actually break it: a missing field, a null, a nested
 * path through an array, a value of the wrong type.
 */

export const CONDITION_OPERATORS = [
    "eq",
    "ne",
    "lt",
    "lte",
    "gt",
    "gte",
    "in",
    "contains",
    "startsWith",
    "endsWith",
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/** Query keys the engine reads itself; everything else is a field condition. */
const RESERVED_KEYS = new Set(["_sort", "_page", "_per_page", "_embed", "_where", "_dependent"]);

export type QueryFailure = { readonly ok: false; readonly reason: "invalid_query" };

export type Pagination = {
    readonly first: number;
    readonly prev: number | null;
    readonly next: number | null;
    readonly last: number;
    readonly pages: number;
    readonly items: number;
    readonly data: readonly JsonValue[];
};

export type QueryOutcome =
    | { readonly ok: true; readonly paginated: false; readonly data: readonly JsonValue[] }
    | { readonly ok: true; readonly paginated: true; readonly page: Pagination }
    | QueryFailure;

/**
 * Reads a value at a dotted path.
 *
 * Descends objects only. A path through an array — `tags.0` — returns nothing
 * rather than indexing, because `json-server` treats a path as a chain of object
 * keys and supporting one form of index quietly invites the ones it does not
 * support.
 */
export function readPath(value: JsonValue, path: string): JsonValue | undefined {
    let current: JsonValue | undefined = value;

    for (const segment of path.split(".")) {
        if (current === undefined || !isPlainObject(current)) {
            return undefined;
        }

        current = current[segment];
    }

    return current;
}

/**
 * Coerces a query value by its own literal shape, exactly as the reference does.
 *
 * `true`, `false` and `null` become those values; anything that reads as a
 * finite number becomes one; everything else stays text. Note what this is
 * *not*: it does not look at the stored value's type. That was the first
 * implementation here and it is wrong, because it makes this server disagree
 * with a local `json-server` on the same document — `?code=007` finds a record
 * whose `code` is the string `"007"` under one and not the other, and a fixture
 * that behaves differently once it is hosted is the one defect this tool cannot
 * have.
 *
 * The consequence is worth knowing rather than discovering: a numeric-looking
 * query never matches a string field. `?code=007` coerces to the number 7, and
 * `"007" === 7` is false. That is the reference's behaviour and the article says
 * so.
 */
function coerce(text: string): JsonValue {
    if (text === "true") {
        return true;
    }

    if (text === "false") {
        return false;
    }

    if (text === "null") {
        return null;
    }

    if (text.trim() === "") {
        return text;
    }

    const parsed = Number(text);

    return Number.isFinite(parsed) ? parsed : text;
}

function compare(left: JsonValue | undefined, right: JsonValue | undefined): number | null {
    if (typeof left === "number" && typeof right === "number") {
        return left - right;
    }

    if (typeof left === "string" && typeof right === "string") {
        return left < right ? -1 : left > right ? 1 : 0;
    }

    // Two values of different kinds have no ordering worth inventing, and a
    // comparison that silently returned `false` for every record would look
    // exactly like an empty collection.
    return null;
}

function asText(value: JsonValue | undefined): string | null {
    return typeof value === "string" ? value : null;
}

/** One `field:operator=value`, applied to one record. */
export function matchesCondition(
    record: JsonValue,
    field: string,
    operator: ConditionOperator,
    text: string,
): boolean {
    const actual = readPath(record, field);

    switch (operator) {
        case "eq":
            return actual === coerce(text);
        case "ne":
            return actual !== coerce(text);
        case "lt":
        case "lte":
        case "gt":
        case "gte": {
            const ordering = compare(actual, coerce(text));

            if (ordering === null) {
                return false;
            }

            return operator === "lt"
                ? ordering < 0
                : operator === "lte"
                  ? ordering <= 0
                  : operator === "gt"
                    ? ordering > 0
                    : ordering >= 0;
        }
        case "in":
            // Split before coercing, so `?id:in=1,2,3` compares three values
            // rather than one string that happens to contain commas. The parts
            // are trimmed, matching `parse-where.js`.
            return text.split(",").some((part) => actual === coerce(part.trim()));
        case "contains": {
            const haystack = asText(actual);

            return haystack === null ? false : haystack.toLowerCase().includes(text.toLowerCase());
        }
        case "startsWith": {
            const haystack = asText(actual);

            return haystack === null
                ? false
                : haystack.toLowerCase().startsWith(text.toLowerCase());
        }
        case "endsWith": {
            const haystack = asText(actual);

            return haystack === null ? false : haystack.toLowerCase().endsWith(text.toLowerCase());
        }
    }
}

function isOperator(name: string): name is ConditionOperator {
    return (CONDITION_OPERATORS as readonly string[]).includes(name);
}

/**
 * Splits `field:operator` — and `field_operator`, which is v0.17's spelling.
 *
 * The old form is still read because `json-server`'s own `splitKey` still reads
 * it, and a fixture's accompanying client is often older than the fixture. It
 * carries the same quirk there and here: a field genuinely named `user_in`
 * cannot be queried, because it parses as `user` with the `in` operator. A field
 * named `created_at` is fine, `at` not being an operator.
 */
function splitCondition(key: string): { field: string; operator: ConditionOperator } | null {
    const colon = key.lastIndexOf(":");

    if (colon >= 0) {
        const operator = key.slice(colon + 1);
        const field = key.slice(0, colon);

        if (operator.length === 0) {
            return { field: key, operator: "eq" };
        }

        // A colon with something unrecognised after it is a refusal here where
        // the reference silently drops the condition. See the note on
        // `runQuery`: a filter that is ignored returns the whole collection and
        // looks exactly like one that matched everything.
        return isOperator(operator) && field.length > 0 ? { field, operator } : null;
    }

    const underscore = /^(.*)_([a-z]+)$/u.exec(key);

    if (underscore !== null && underscore[1].length > 0 && isOperator(underscore[2])) {
        return { field: underscore[1], operator: underscore[2] };
    }

    return { field: key, operator: "eq" };
}

/**
 * Sorts by one or more fields, `-` prefixed for descending.
 *
 * This mirrors `sort-on`, which is what `json-server` sorts with, and two of its
 * rules are nothing like the obvious implementation. Both were found by running
 * the two engines side by side against the same document; neither would have
 * been guessed.
 *
 * - **Strings compare with `localeCompare`, not with `<`.** So `"a title"` sorts
 *   before `"Tenth"`, where a code-unit comparison puts every capital first. A
 *   sort in which `Zebra` precedes `apple` looks broken to everyone who sees it,
 *   which is presumably why `sort-on` does this.
 * - **A falsy value sorts *last* ascending — except `0`.** `false` after `true`,
 *   `null` and `""` after everything. It reads backwards, and it is what the
 *   reference does, so `?_sort=draft` puts the drafts first.
 *
 * `localeCompare` is collation, and collation is host-derived — the rule in
 * CLAUDE.md that bars `Intl.supportedValuesOf` from a render path. It is safe
 * here for a reason worth stating rather than assuming: this engine is only ever
 * reached from `repository/serve.ts`, which is `server-only`, so its output never
 * takes part in a hydration pass. Two hosts with different ICU could order two
 * records differently; nothing on this site would render both.
 *
 * `toSorted` rather than `sort`, so the caller's array is never mutated — this
 * runs over the live document, and an in-place sort would silently reorder the
 * stored collection on a `GET`.
 */
export function sortRecords(records: readonly JsonValue[], spec: string): readonly JsonValue[] {
    const keys = spec
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) =>
            entry.startsWith("-")
                ? { field: entry.slice(1), descending: true }
                : { field: entry, descending: false },
        );

    if (keys.length === 0) {
        return records;
    }

    return records.toSorted((left, right) => {
        for (const { field, descending } of keys) {
            const ordering = compareForSort(
                readPath(left, field),
                readPath(right, field),
                descending,
            );

            if (ordering !== 0) {
                return ordering;
            }
        }

        return 0;
    });
}

/** Falsy in `sort-on`'s sense: everything JavaScript calls falsy except `0`. */
function sortsLast(value: JsonValue | undefined): boolean {
    return value !== 0 && !value;
}

function compareForSort(
    left: JsonValue | undefined,
    right: JsonValue | undefined,
    descending: boolean,
): number {
    if (left === right) {
        return 0;
    }

    if (sortsLast(right)) {
        return descending ? 1 : -1;
    }

    if (sortsLast(left)) {
        return descending ? -1 : 1;
    }

    if (typeof left === "string" && typeof right === "string") {
        return descending ? right.localeCompare(left) : left.localeCompare(right);
    }

    const ascending = (left as number) < (right as number) ? -1 : 1;

    return descending ? -ascending : ascending;
}

/**
 * `_page` / `_per_page`, and the envelope the reference returns.
 *
 * Out-of-range values are normalised rather than refused, which the reference
 * documents explicitly: `_page=0` and `_page=999` on a four-page collection both
 * land on a real page. A 400 here would break a paging loop that simply ran one
 * past the end.
 */
export function paginate(records: readonly JsonValue[], page: number, perPage: number): Pagination {
    // `perPage` of 0 or below becomes **1**, not the default. That is
    // `lib/paginate.js`'s rule and it is the difference between
    // `?_page=1&_per_page=0` returning one record and returning ten.
    const requested = Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 1;
    const size = Math.min(requested, MAX_PER_PAGE);
    const pages = Math.max(1, Math.ceil(records.length / size));
    const current = Math.min(Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1), pages);
    const start = (current - 1) * size;

    return {
        first: 1,
        prev: current > 1 ? current - 1 : null,
        next: current < pages ? current + 1 : null,
        last: pages,
        pages,
        items: records.length,
        data: records.slice(start, start + size),
    };
}

// ─── _where ─────────────────────────────────────────────────────────────────

/**
 * The nested form: `?_where={"or":[{"views":{"gt":100}},…]}`.
 *
 * Evaluated against **raw JSON values**, not through `matchesCondition`. That is
 * not a refactor — it is the fix for a real defect. `_where` operands are already
 * typed: `{"id": {"in": ["1", "2"]}}` carries an array. Routing them through the
 * string-based path stringified it to `["1","2"]` and split it on commas, so the
 * query matched nothing at all. The flat syntax coerces because a query string
 * is text; this one must not, because it is not.
 *
 * The rules below mirror `lib/matches-where.js`:
 *
 * - **Every operator present in one clause must pass** — they are an `and`.
 * - **A field is read as a direct property, not a dotted path.** Nesting is how
 *   `_where` spells a path, and `parseWhere` builds exactly that shape from a
 *   flat `?author.name:eq=x`, so both syntaxes end up here identically.
 * - **A missing field fails any operator clause**, rather than comparing against
 *   `undefined`.
 * - **A nested clause against a field that is not an object passes.** This one
 *   reads like a bug and is matched deliberately: diverging would mean a query
 *   returns different rows here than it does against a local `json-server`, and
 *   being a faithful clone is what this tool is for.
 *
 * Three things here are deliberately *not* the reference, and all three are
 * strictly additive — a query that works there works here:
 *
 * - **A bare value is an equality.** `{"views": 100}` matches. The reference
 *   returns `false` for every record on that shape, which is a plain defect and
 *   one no working client can depend on.
 * - **`and` is supported.** The reference handles only `or`; an `and` key there
 *   matches nothing.
 * - **A malformed `_where` is a 400.** The reference ignores one it cannot read
 *   and falls back to the flat conditions, so a typo returns the whole collection
 *   and looks exactly like a filter that matched everything.
 */
export function evaluateWhere(record: JsonValue, clause: JsonValue, depth = 0): boolean | null {
    // `null` means "this query is not answerable" and becomes a 400; `false`
    // means "this record does not match". Folding the two together is how a
    // clause nested past the ceiling comes back as an empty result set instead
    // of a refusal, which is the same silent-wrong-answer failure the malformed
    // `_where` case exists to avoid.
    if (depth > MAX_WHERE_DEPTH || !isPlainObject(clause)) {
        return null;
    }

    if (!isPlainObject(record)) {
        return false;
    }

    for (const key of Object.keys(clause)) {
        const value = clause[key];

        if (key === "or" || key === "and") {
            if (!Array.isArray(value) || value.length === 0) {
                return null;
            }

            const results = value.map((entry) => evaluateWhere(record, entry, depth + 1));

            if (results.includes(null)) {
                return null;
            }

            const group =
                key === "or"
                    ? results.some((result) => result === true)
                    : results.every((result) => result === true);

            if (!group) {
                return false;
            }

            continue;
        }

        const field = record[key];

        if (isPlainObject(value)) {
            const operators = Object.keys(value).filter(isOperator);

            if (operators.length > 0) {
                if (field === undefined) {
                    return false;
                }

                for (const operator of operators) {
                    if (!matchesOperand(field, operator, value[operator])) {
                        return false;
                    }
                }

                continue;
            }

            // A nested clause: descend when the field is an object, and pass
            // when it is not. See the note above — the second half is the
            // reference's behaviour, matched on purpose.
            if (isPlainObject(field)) {
                const nested = evaluateWhere(field, value, depth + 1);

                if (nested === null) {
                    return null;
                }

                if (!nested) {
                    return false;
                }
            }

            continue;
        }

        // A bare value. The reference always fails here; this treats it as the
        // equality it obviously means.
        if (field !== value) {
            return false;
        }
    }

    return true;
}

/**
 * The four ordering operators, through JavaScript's own relational comparison.
 *
 * The casts are deliberate and are what makes this match. `lib/matches-where.js`
 * writes `field < op.lt` on raw values, so the coercions JavaScript performs —
 * `null` as `0`, a `Date`-shaped string as text — are part of the behaviour
 * rather than an accident of it. Narrowing to `number | string` first would
 * refuse comparisons the reference happily makes, and a `_where` that returns
 * fewer rows here than locally is exactly the divergence this file exists to
 * avoid.
 */
function relational(
    field: JsonValue,
    operand: JsonValue,
): { lt: boolean; lte: boolean; gt: boolean; gte: boolean } {
    const left = field as number;
    const right = operand as number;

    // Each written out rather than derived from its opposite: `<=` is not
    // `!(>)` in general, and reaching for the negation is how a comparison
    // acquires a case nobody meant.
    return { lt: left < right, lte: left <= right, gt: left > right, gte: left >= right };
}

/** One operator against one already-typed operand. */
function matchesOperand(
    field: JsonValue,
    operator: ConditionOperator,
    operand: JsonValue,
): boolean {
    switch (operator) {
        case "lt":
            return relational(field, operand).lt;
        case "lte":
            return relational(field, operand).lte;
        case "gt":
            return relational(field, operand).gt;
        case "gte":
            return relational(field, operand).gte;
        case "eq":
            return field === operand;
        case "ne":
            return field !== operand;
        case "in": {
            const values = Array.isArray(operand) ? operand : [operand];

            return values.some((value) => field === value);
        }
        case "contains":
            return (
                typeof field === "string" &&
                field.toLowerCase().includes(String(operand).toLowerCase())
            );
        case "startsWith":
            return (
                typeof field === "string" &&
                field.toLowerCase().startsWith(String(operand).toLowerCase())
            );
        case "endsWith":
            return (
                typeof field === "string" &&
                field.toLowerCase().endsWith(String(operand).toLowerCase())
            );
    }
}

// ─── the whole query ────────────────────────────────────────────────────────

export type QueryPairs = readonly (readonly [string, string])[];

function firstOf(query: QueryPairs, key: string): string | undefined {
    return query.find(([name]) => name === key)?.[1];
}

/**
 * Embeds, filters, sorts and pages a collection.
 *
 * The order is the reference's and it is not interchangeable. **Embedding comes
 * first**, which looks wasteful — it relates every record and then throws most
 * of them away — and is the only order that lets a query reach an embedded
 * field: `?_embed=post&_sort=post.title` sorts on something that does not exist
 * until the embed has run. Embedding last is cheaper and silently drops that
 * whole class of query.
 *
 * After that: filter, then sort, then page. Sorting before filtering would waste
 * the sort; paging before sorting would page an arbitrary order.
 */
export function runQuery(
    records: readonly JsonValue[],
    query: QueryPairs,
    resource = "",
    document: JsonObject = {},
): QueryOutcome {
    const embedded = applyEmbeds(records, resource, query, document);
    const whereText = firstOf(query, "_where");
    let filtered: readonly JsonValue[];

    if (whereText !== undefined) {
        if (whereText.length > MAX_WHERE_LENGTH) {
            return { ok: false, reason: "invalid_query" };
        }

        let clause: JsonValue;

        try {
            clause = JSON.parse(whereText) as JsonValue;
        } catch {
            return { ok: false, reason: "invalid_query" };
        }

        const kept: JsonValue[] = [];

        for (const record of embedded) {
            const verdict = evaluateWhere(record, clause);

            if (verdict === null) {
                return { ok: false, reason: "invalid_query" };
            }

            if (verdict) {
                kept.push(record);
            }
        }

        filtered = kept;
    } else {
        const conditions: { field: string; operator: ConditionOperator; text: string }[] = [];

        for (const [key, value] of query) {
            if (RESERVED_KEYS.has(key)) {
                continue;
            }

            const split = splitCondition(key);

            if (split === null) {
                return { ok: false, reason: "invalid_query" };
            }

            conditions.push({ ...split, text: value });
        }

        // Repeated keys intersect rather than replace, so
        // `?views:gt=10&views:lt=90` is a range and not just the second half.
        filtered = embedded.filter((record) =>
            conditions.every(({ field, operator, text }) =>
                matchesCondition(record, field, operator, text),
            ),
        );
    }

    const sortSpec = firstOf(query, "_sort");
    const sorted = sortSpec === undefined ? filtered : sortRecords(filtered, sortSpec);

    // Pagination is gated on `_page` **alone**. `?_per_page=3` with no page is a
    // plain array, not a one-page envelope — `lib/app.js` reads `_per_page` into
    // the options and then only calls `paginate` when `page !== undefined`. And
    // `parseInt` rather than `Number`, so `?_page=2x` is page 2 while `?_page=x`
    // is no pagination at all, both of which the reference does.
    const page = Number.parseInt(firstOf(query, "_page") ?? "", 10);

    if (Number.isNaN(page)) {
        return { ok: true, paginated: false, data: sorted };
    }

    const perPage = Number.parseInt(firstOf(query, "_per_page") ?? "", 10);

    return {
        ok: true,
        paginated: true,
        page: paginate(sorted, page, Number.isNaN(perPage) ? DEFAULT_PER_PAGE : perPage),
    };
}

// ─── _embed ─────────────────────────────────────────────────────────────────

/**
 * Naive singularisation and pluralisation, for relating `posts` to `postId`.
 *
 * Deliberately not a library. The reference uses `inflection`, which carries the
 * full table of English irregulars; here `_embed` only ever has to relate two
 * names the *same document* already contains, so the failure mode of a wrong
 * guess is one embed that comes back empty rather than corrupted data. The
 * common shapes — a trailing `s`, `-ies`, `-es` — are what fixtures actually
 * use. `people` and `children` will not resolve, and the article says so.
 */
export function singularize(name: string): string {
    if (name.endsWith("ies") && name.length > 3) {
        return `${name.slice(0, -3)}y`;
    }

    if (name.endsWith("ses") || name.endsWith("xes") || name.endsWith("ches")) {
        return name.slice(0, -2);
    }

    return name.endsWith("s") && !name.endsWith("ss") ? name.slice(0, -1) : name;
}

function pluralize(name: string): string {
    if (singularize(name) !== name) {
        return name;
    }

    if (name.endsWith("y") && !/[aeiou]y$/u.test(name)) {
        return `${name.slice(0, -1)}ies`;
    }

    return /(s|x|ch|sh)$/u.test(name) ? `${name}es` : `${name}s`;
}

/** `?_embed=comments` on `/posts` — the foreign key a child would carry. */
export function foreignKeyFor(parent: string): string {
    return `${singularize(parent)}Id`;
}

/**
 * Attaches related records, in whichever direction the name points.
 *
 * Both directions share one spelling — `_embed` — and **which one is meant is
 * decided by the target's own plurality, not by trying one and falling back**.
 * That is the reference's rule and it is the only one that works:
 *
 * - `?_embed=post` on `/comments` — `post` is already singular, so this is the
 *   *parent* direction. The records are looked up in **`posts`** (pluralised),
 *   by this record's `postId`.
 * - `?_embed=comments` on `/posts` — plural, so the *child* direction:
 *   `comments` filtered by `postId === this.id`.
 *
 * The pluralisation is the part an implementation gets wrong by omitting: a
 * first version here read `document["post"]`, which no document has, so
 * `_embed=post` silently returned nothing on every fixture.
 *
 * A name that resolves to no collection is left alone rather than erroring,
 * because a stale `_embed` in somebody's client should not break the request
 * that carries it.
 */
export function embedInto(
    record: JsonValue,
    resource: string,
    target: string,
    document: JsonObject,
): JsonValue {
    if (!isPlainObject(record)) {
        return record;
    }

    if (singularize(target) === target) {
        const related = document[pluralize(target)];

        if (!Array.isArray(related)) {
            return record;
        }

        const parentId = readPath(record, `${target}Id`);
        const parent = related.find((candidate) => readPath(candidate, "id") === parentId);

        // The key is **omitted** when no parent matched, rather than set to
        // `null`. The reference writes `undefined` there and `JSON.stringify`
        // drops it, so an orphan comment comes back with no `post` key at all —
        // and a client doing `if ("post" in comment)` would read a `null` as a
        // parent that exists and is empty.
        return parent === undefined ? record : { ...record, [target]: parent };
    }

    const related = document[target];

    if (!Array.isArray(related)) {
        return record;
    }

    const key = foreignKeyFor(resource);
    const id = readPath(record, "id");

    // An empty array is still an answer: it says "this post has no comments",
    // which is not the same as saying nothing.
    return { ...record, [target]: related.filter((child) => readPath(child, key) === id) };
}

/** The `_embed` targets a query names, across every repetition of the key. */
export function embedTargets(query: QueryPairs): readonly string[] {
    return query
        .filter(([key]) => key === "_embed")
        .flatMap(([, value]) => value.split(",").map((entry) => entry.trim()))
        .filter((entry) => entry.length > 0);
}

export function applyEmbeds(
    records: readonly JsonValue[],
    resource: string,
    query: QueryPairs,
    document: JsonObject,
): readonly JsonValue[] {
    const targets = embedTargets(query);

    if (targets.length === 0) {
        return records;
    }

    return records.map((record) =>
        targets.reduce<JsonValue>(
            (carried, target) => embedInto(carried, resource, target, document),
            record,
        ),
    );
}
