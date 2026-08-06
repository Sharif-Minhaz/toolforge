import type { JsonObject, JsonValue } from "@/modules/tools/types/json-document";

import { DEFAULT_PER_PAGE, MAX_PER_PAGE } from "./constants";
import type { FieldModel } from "../types";

/**
 * Filtering, sorting and paging a collection — pure, and with no GraphQL in it.
 *
 * The arguments arrive already coerced by `graphql-js` against the generated
 * input types, so nothing here has to guess what a value means. That is the
 * quiet advantage of a typed schema over the REST studio's query string, where
 * `?views=100` has to be read as a number by looking at its shape: here a
 * `views: { gt: 100 }` that was written `gt: "100"` never reaches this file at
 * all, because input coercion refused it with a message naming the field.
 *
 * **The sort comparator is deliberately identical to the REST studio's**, down
 * to the two behaviours nobody would invent: strings compare with
 * `localeCompare`, so `"a title"` precedes `"Tenth"`; and falsy values sort last
 * ascending **except `0`**, so a boolean field leads with `true`. Neither is what
 * a GraphQL API would choose on its own, and matching them anyway is the point —
 * the same `db.json` can be served through both studios at once, and a document
 * whose records reorder depending on which endpoint you asked is a far worse
 * surprise than one documented quirk. The article says so in both tools.
 */

export type FilterValue = Readonly<Record<string, unknown>>;

export type WhereInput = Readonly<Record<string, unknown>>;

export type ListArgs = {
    readonly where?: WhereInput | null;
    readonly orderBy?: string | null;
    readonly order?: "ASC" | "DESC" | null;
    readonly page?: number | null;
    readonly perPage?: number | null;
};

/** Published field name → the key it is stored under. */
export type FieldLookup = ReadonlyMap<string, string>;

export function fieldLookup(fields: readonly FieldModel[]): FieldLookup {
    return new Map(fields.map((field) => [field.name, field.sourceKey]));
}

export type Page = {
    readonly nodes: readonly JsonObject[];
    readonly total: number;
    readonly page: number;
    readonly perPage: number;
    readonly pages: number;
};

/**
 * The whole read pipeline: filter, then sort, then page.
 *
 * That order is the only correct one and is worth stating because getting it
 * wrong is invisible on small fixtures — paging before filtering returns "page 1
 * of the unfiltered set, minus what did not match", which for a page size of ten
 * over two hundred records looks like a working filter that occasionally returns
 * three results.
 */
export function selectRecords(
    records: readonly JsonObject[],
    args: ListArgs,
    lookup: FieldLookup,
): Page {
    const filtered =
        args.where === null || args.where === undefined
            ? records
            : records.filter((record) => matchesWhere(record, args.where as WhereInput, lookup));

    const sorted =
        args.orderBy === null || args.orderBy === undefined
            ? filtered
            : sortRecords(
                  filtered,
                  lookup.get(args.orderBy) ?? args.orderBy,
                  args.order === "DESC",
              );

    return paginate(sorted, args.page, args.perPage);
}

/**
 * A page, with the arguments clamped rather than refused.
 *
 * `perPage` has a **default and a ceiling, and both are load-bounding rather
 * than cosmetic**: the node estimator in `cost.ts` multiplies each list field's
 * page size down the query tree before a single record is read, and it can only
 * do that because every list field has a size it cannot exceed. Take the default
 * away and the estimator would have to assume `MAX_PER_PAGE` everywhere, which
 * would refuse queries that are entirely reasonable.
 *
 * A page past the end is an empty page rather than an error — a client paging
 * until it runs out is doing the normal thing, and making the last request a
 * failure would mean every such loop ends in an error handler.
 */
export function paginate(
    records: readonly JsonObject[],
    page: number | null | undefined,
    perPage: number | null | undefined,
): Page {
    const size = clampPerPage(perPage);
    const total = records.length;
    const pages = Math.ceil(total / size);
    const current = Math.max(1, Math.floor(page ?? 1));
    const start = (current - 1) * size;

    return {
        nodes: records.slice(start, start + size),
        total,
        page: current,
        perPage: size,
        pages,
    };
}

export function clampPerPage(perPage: number | null | undefined): number {
    if (perPage === null || perPage === undefined || !Number.isFinite(perPage)) {
        return DEFAULT_PER_PAGE;
    }

    return Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(perPage)));
}

// ─── filtering ──────────────────────────────────────────────────────────────

/**
 * Whether one record satisfies a `where` clause.
 *
 * Field clauses AND together, which is the behaviour every query language in
 * this shape has and the one people assume. `AND`, `OR` and `NOT` nest, and
 * their depth is bounded by `MAX_QUERY_DEPTH` at validation — a `where` is part
 * of the query document, so the same rule that stops a runaway selection set
 * stops a runaway filter, and this file needs no recursion guard of its own.
 */
export function matchesWhere(record: JsonObject, where: WhereInput, lookup: FieldLookup): boolean {
    for (const [key, raw] of Object.entries(where)) {
        if (raw === null || raw === undefined) {
            // An argument explicitly passed as `null`, which GraphQL allows and
            // which means "no constraint" rather than "must be null" — the
            // latter is spelled `{ eq: null }`.
            continue;
        }

        if (key === "AND") {
            if (!(raw as WhereInput[]).every((clause) => matchesWhere(record, clause, lookup))) {
                return false;
            }

            continue;
        }

        if (key === "OR") {
            if (!(raw as WhereInput[]).some((clause) => matchesWhere(record, clause, lookup))) {
                return false;
            }

            continue;
        }

        if (key === "NOT") {
            if (matchesWhere(record, raw as WhereInput, lookup)) {
                return false;
            }

            continue;
        }

        if (!matchesFilter(record[lookup.get(key) ?? key], raw as FilterValue)) {
            return false;
        }
    }

    return true;
}

/**
 * One field against one filter.
 *
 * Every operator present must hold — `{ gt: 10, lt: 20 }` is a range, not a
 * choice. An operator whose value was not supplied is absent from the object
 * entirely, because `graphql-js` omits unprovided input fields rather than
 * setting them to `undefined`, so "not asked for" and "asked for null" stay
 * distinguishable.
 */
export function matchesFilter(value: JsonValue | undefined, filter: FilterValue): boolean {
    for (const [operator, operand] of Object.entries(filter)) {
        if (operand === undefined) {
            continue;
        }

        if (!applyOperator(value, operator, operand)) {
            return false;
        }
    }

    return true;
}

function applyOperator(value: JsonValue | undefined, operator: string, operand: unknown): boolean {
    switch (operator) {
        case "eq":
            return sameValue(value, operand);
        case "ne":
            return !sameValue(value, operand);
        case "in":
            return (operand as unknown[]).some((entry) => sameValue(value, entry));
        case "nin":
            return !(operand as unknown[]).some((entry) => sameValue(value, entry));
        case "gt":
            return compareOrdered(value, operand, (ordering) => ordering > 0);
        case "gte":
            return compareOrdered(value, operand, (ordering) => ordering >= 0);
        case "lt":
            return compareOrdered(value, operand, (ordering) => ordering < 0);
        case "lte":
            return compareOrdered(value, operand, (ordering) => ordering <= 0);
        case "contains":
            return foldedText(value).includes(folded(operand));
        case "startsWith":
            return foldedText(value).startsWith(folded(operand));
        case "endsWith":
            return foldedText(value).endsWith(folded(operand));
        default:
            // Unreachable through the schema: an operator outside the generated
            // input type is refused by validation before this runs. Refusing to
            // match — rather than matching — is the safe reading of a filter this
            // file does not understand.
            return false;
    }
}

/**
 * Equality across the JSON scalars.
 *
 * `null` compares equal to an absent field, which is the reading a fixture
 * wants: `{ deletedAt: { eq: null } }` should find the records that have never
 * been deleted whether they carry `deletedAt: null` or no such key at all. In
 * JSON those are two spellings of the same fact, and distinguishing them would
 * make the filter depend on how the document happened to be written.
 */
function sameValue(value: JsonValue | undefined, operand: unknown): boolean {
    if (operand === null) {
        return value === null || value === undefined;
    }

    return value === operand;
}

function compareOrdered(
    value: JsonValue | undefined,
    operand: unknown,
    accept: (ordering: number) => boolean,
): boolean {
    // A missing field is not greater or less than anything. Excluding it is what
    // keeps `gt` and `lte` from between them matching every record.
    if (value === null || value === undefined) {
        return false;
    }

    if (typeof value === "string" && typeof operand === "string") {
        return accept(value.localeCompare(operand));
    }

    if (typeof value === "number" && typeof operand === "number") {
        return accept(value === operand ? 0 : value < operand ? -1 : 1);
    }

    return false;
}

function foldedText(value: JsonValue | undefined): string {
    return typeof value === "string" ? value.toLowerCase() : "";
}

function folded(operand: unknown): string {
    return typeof operand === "string" ? operand.toLowerCase() : "";
}

// ─── sorting ────────────────────────────────────────────────────────────────

export function sortRecords(
    records: readonly JsonObject[],
    key: string,
    descending: boolean,
): readonly JsonObject[] {
    return records.toSorted((left, right) => compareForSort(left[key], right[key], descending));
}

/** Falsy in `sort-on`'s sense: everything JavaScript calls falsy except `0`. */
function sortsLast(value: JsonValue | undefined): boolean {
    return value !== 0 && !value;
}

/**
 * The REST studio's comparator, character for character.
 *
 * Copied deliberately rather than shared, because the two live in different
 * modules and neither may import the other — and lifting it would mean lifting
 * `sort-on`'s quirks into `tools/` as though they were a house rule, when in
 * fact they are one library's behaviour that this repository has decided to be
 * consistent with. The tie is broken by a test in each module asserting the same
 * three orderings, so a change to one that is not made to the other goes red.
 */
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
