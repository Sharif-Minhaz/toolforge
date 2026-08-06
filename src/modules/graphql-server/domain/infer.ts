import { isPlainObject } from "@/modules/tools/domain/json-document";
import type { JsonObject, JsonValue } from "@/modules/tools/types/json-document";

import { isPublishableFieldName, toFieldName, uniqueName } from "./naming";
import type { FieldModel, FieldType, GraphqlScalar } from "../types";

/**
 * Working out what type each key in a collection holds.
 *
 * Three decisions here are the ones that would be wrong if made the obvious way.
 *
 * **Every record is read, not a sample.** The REST studio samples fifty records
 * to list a collection's field names, and that is right there — the list is a
 * *hint* for writing a query. Here the answer becomes the published type, and a
 * type inferred from fifty records that record 4,000 contradicts is a schema
 * whose own data does not validate against it. The document is capped at a
 * megabyte, so reading all of it is bounded work done once per request.
 *
 * **`Int` is 32 bits, and that is a specification fact rather than a
 * suggestion.** GraphQL's `Int` is explicitly a signed 32-bit integer, and
 * serialising `9_000_000_000` through it is an error at response time — a field
 * that works for the first ten thousand records and then throws. Any integer
 * outside that range is `Float`, which GraphQL defines as a double and can carry
 * it exactly up to 2^53.
 *
 * **A field of two different types is `JSON`, not the wider of the two.** A key
 * that is a string in one record and a number in another is not "really a
 * string"; it is a fixture with two shapes in it, and saying so is more useful
 * than picking one and having the other fail to serialise.
 */

/** GraphQL's `Int`, per the specification: a signed 32-bit integer. */
const INT_MIN = -2_147_483_648;

const INT_MAX = 2_147_483_647;

/**
 * The reader guarantees every collection record carries a non-empty string
 * `id`, so it is the one field whose type is known before anything is read.
 */
export const ID_FIELD = "id";

type Observation = {
    scalars: Set<GraphqlScalar>;
    sawList: boolean;
    sawNonList: boolean;
    sawNull: boolean;
    sawNullItem: boolean;
    /**
     * How many records carried the key at all.
     *
     * Counted rather than flagged, because "absent from some record" is only
     * knowable once every record has been read — and comparing one number
     * against `records.length` at the end is what keeps this a single pass
     * instead of a second sweep per field.
     */
    present: number;
};

/**
 * Every published field of a collection, in first-seen order.
 *
 * Order matters more than it looks: it is the order the SDL prints, so a
 * document read twice has to produce the same file byte for byte or an SDL
 * checked into somebody's repository churns on every deploy.
 */
export function inferFields(records: readonly JsonObject[]): readonly FieldModel[] {
    const fields = inferFrom(records);

    // A collection always publishes `id`, even when it has no records to infer
    // it from. `{"posts": []}` is exactly how somebody starts a server they
    // intend to mutate into, and a GraphQL type with no fields is a **syntax
    // error** — so without this the most natural empty document produces a
    // schema that will not parse. The reader guarantees every stored record
    // carries a non-empty string id, so asserting it here invents nothing.
    return fields.some((field) => field.sourceKey === ID_FIELD)
        ? fields
        : [{ name: ID_FIELD, sourceKey: ID_FIELD, type: ID_TYPE }, ...fields];
}

/**
 * The same inference without the `id` guarantee, for a singular resource.
 *
 * A lone object has no id — there is nothing to look one up by — so asserting
 * one here would publish a field that resolves to `null` on every read.
 */
export function inferSingularFields(value: JsonValue): readonly FieldModel[] {
    return isPlainObject(value) ? inferFrom([value]) : [];
}

function inferFrom(records: readonly JsonObject[]): readonly FieldModel[] {
    const observations = new Map<string, Observation>();
    const total = records.length;

    for (const record of records) {
        for (const key of Object.keys(record)) {
            let observation = observations.get(key);

            if (observation === undefined) {
                observation = {
                    scalars: new Set(),
                    sawList: false,
                    sawNonList: false,
                    sawNull: false,
                    sawNullItem: false,
                    present: 0,
                };
                observations.set(key, observation);
            }

            observation.present += 1;
            observe(observation, record[key]);
        }
    }

    const taken = new Set<string>();
    const fields: FieldModel[] = [];

    for (const [key, observation] of observations) {
        const published = publishableName(key, taken);

        if (published === null) {
            continue;
        }

        taken.add(published);
        fields.push({
            name: published,
            sourceKey: key,
            type:
                key === ID_FIELD ? ID_TYPE : resolveType(observation, observation.present < total),
        });
    }

    // `id` first, because a record read back should look like the one that was
    // written and every fixture leads with it.
    return [...fields].sort((left, right) => rank(left) - rank(right));
}

const ID_TYPE: FieldType = { scalar: "ID", list: false, nullable: false, itemsNullable: false };

function rank(field: FieldModel): number {
    return field.sourceKey === ID_FIELD ? 0 : 1;
}

/**
 * A record key, made publishable.
 *
 * Left exactly as written when GraphQL already accepts it, which is the common
 * case and the one where any rewriting would be this tool second-guessing
 * somebody's data. `full-name` is repaired to `fullName` and the resolver reads
 * the original key — the response is then keyed by the *published* name, which
 * is what a GraphQL client expects and what makes the repair usable rather than
 * merely legal.
 */
function publishableName(key: string, taken: ReadonlySet<string>): string | null {
    const wanted = isPublishableFieldName(key) ? key : toFieldName(key);

    return wanted === null ? null : uniqueName(wanted, taken);
}

function observe(observation: Observation, value: JsonValue): void {
    if (value === null) {
        observation.sawNull = true;

        return;
    }

    if (Array.isArray(value)) {
        observation.sawList = true;

        for (const item of value) {
            if (item === null) {
                observation.sawNullItem = true;

                continue;
            }

            observation.scalars.add(scalarOf(item));
        }

        return;
    }

    observation.sawNonList = true;
    observation.scalars.add(scalarOf(value));
}

/**
 * The scalar one value is.
 *
 * An object is `JSON` rather than a generated nested type. That is a real
 * limitation and a deliberate one: promoting every nested object to its own
 * GraphQL type means inventing a name for it, and a name invented from a field
 * key would collide across collections, change whenever a field is renamed, and
 * multiply the schema by the document's nesting depth. A fixture's nested value
 * is almost always a bag being carried around rather than an entity being
 * queried, so it is carried.
 */
function scalarOf(value: JsonValue): GraphqlScalar {
    if (typeof value === "string") {
        return "String";
    }

    if (typeof value === "boolean") {
        return "Boolean";
    }

    if (typeof value === "number") {
        return Number.isInteger(value) && value >= INT_MIN && value <= INT_MAX ? "Int" : "Float";
    }

    // An object, or an array nested inside an array. Both are `JSON`: the second
    // because `[[Int]]` from a fixture is far more often ragged data than a
    // genuine matrix, and one wrong list-of-lists breaks every query on the type.
    return "JSON";
}

function resolveType(observation: Observation, sawMissing: boolean): FieldType {
    const scalar = collapseScalars(observation.scalars);

    // A key that was an array in one record and a bare value in another has no
    // honest list-ness, so it degrades to `JSON` — which can carry both.
    const mixedShape = observation.sawList && observation.sawNonList;

    return {
        scalar: mixedShape ? "JSON" : scalar,
        list: observation.sawList && !mixedShape,
        nullable: observation.sawNull || sawMissing || observation.scalars.size === 0,
        itemsNullable: observation.sawNullItem,
    };
}

/**
 * One scalar from everything seen.
 *
 * `Int` widens to `Float` because every `Int` is a valid `Float` and the reverse
 * is not — that one is a genuine widening rather than a guess. Every other
 * disagreement collapses to `JSON`, because there is no type that is both a
 * `String` and a `Boolean` and pretending otherwise moves the failure from the
 * schema, where it is visible, to a response, where it is a 500.
 */
function collapseScalars(scalars: ReadonlySet<GraphqlScalar>): GraphqlScalar {
    if (scalars.size === 0) {
        // Every observed value was `null`. Nothing is known, and `JSON` is the
        // only type that promises nothing.
        return "JSON";
    }

    if (scalars.size === 1) {
        return [...scalars][0];
    }

    if (scalars.size === 2 && scalars.has("Int") && scalars.has("Float")) {
        return "Float";
    }

    return "JSON";
}
