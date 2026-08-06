import { isPlainObject } from "@/modules/tools/domain/json-document";
import { findIndexById, idOf, nextId } from "@/modules/tools/domain/record-id";
import type { JsonDocument, JsonObject, JsonValue } from "@/modules/tools/types/json-document";
import {
    GraphQLBoolean,
    GraphQLEnumType,
    GraphQLFloat,
    GraphQLID,
    GraphQLInputObjectType,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLScalarType,
    GraphQLSchema,
    GraphQLString,
    Kind,
    type GraphQLFieldConfigArgumentMap,
    type GraphQLFieldConfigMap,
    type GraphQLInputFieldConfigMap,
    type GraphQLInputType,
    type GraphQLOutputType,
    type ValueNode,
} from "graphql";

import { DEFAULT_PER_PAGE } from "./constants";
import { fieldLookup, selectRecords, type ListArgs } from "./query";
import { collectionsOf } from "./schema-model";
import { filterableFields } from "./sdl";
import type {
    CollectionModel,
    FieldModel,
    FieldType,
    ObjectModel,
    RelationModel,
    SchemaModel,
    SingularModel,
} from "../types";

/**
 * The schema model, turned into a real `GraphQLSchema` that can execute.
 *
 * **This file and `guard.ts` are the only two in this module that import
 * `graphql`, and neither may ever be imported by a client component.** See the
 * note at the top of `guard.ts` for why that line matters.
 *
 * The whole design here is that **the document is the source of truth and this
 * is a view over it.** Nothing is cached between requests, no index is built,
 * and no resolver holds state: a schema is derived, a query is run against the
 * document that was read, and both are discarded. That costs a schema build per
 * request — a few milliseconds on a megabyte — and buys the one property a
 * fixture server absolutely needs, which is that a mutation is visible to the
 * very next query with no invalidation step to get wrong.
 *
 * The mutations follow the REST studio's rules exactly, because the same
 * document can be served through both at once and a record that behaves
 * differently depending on which endpoint touched it is the worst thing either
 * could do:
 *
 * - **`update` replaces, `patch` merges.** An `update` that quietly kept fields
 *   the input omitted would make removing one impossible.
 * - **A record's id never changes.** It is absent from the update input rather
 *   than accepted and ignored, so a caller finds out at validation instead of
 *   discovering their write went somewhere else.
 * - **`create` returns the record including its generated id**, which is the
 *   only way a caller learns what to ask for next.
 */

/** The one custom scalar: an arbitrary JSON value, carried through untouched. */
const JSONScalar = new GraphQLScalarType({
    name: "JSON",
    description:
        "An arbitrary JSON value: an object, a mixed-type field, or a nested array. Returned exactly as stored.",
    serialize: (value) => value,
    parseValue: (value) => value,
    parseLiteral: parseJsonLiteral,
});

/**
 * A `JSON` value written as a GraphQL literal.
 *
 * Needed because an input written inline — `patch(input: { meta: { a: 1 } })` —
 * arrives as an AST rather than as a value, unlike the same thing sent as a
 * variable. Without this, inline objects would silently become `null` while the
 * variable spelling of the same thing worked, which is the kind of difference
 * that costs somebody an afternoon.
 */
function parseJsonLiteral(node: ValueNode, variables?: Maybe<Record<string, unknown>>): unknown {
    switch (node.kind) {
        case Kind.STRING:
        case Kind.BOOLEAN:
            return node.value;
        case Kind.INT:
        case Kind.FLOAT:
            return Number(node.value);
        case Kind.NULL:
            return null;
        case Kind.LIST:
            return node.values.map((value) => parseJsonLiteral(value, variables));
        case Kind.OBJECT: {
            const object: Record<string, unknown> = {};

            for (const field of node.fields) {
                object[field.name.value] = parseJsonLiteral(field.value, variables);
            }

            return object;
        }
        case Kind.VARIABLE:
            return variables?.[node.name.value] ?? null;
        default:
            // An enum literal, which has no JSON meaning. `null` rather than a
            // throw: a value this scalar cannot read is one field's problem, not
            // the whole request's.
            return null;
    }
}

type Maybe<T> = T | null | undefined;

const OrderDirection = new GraphQLEnumType({
    name: "OrderDirection",
    description: "Which way a sort runs.",
    values: { ASC: { value: "ASC" }, DESC: { value: "DESC" } },
});

const StringFilter = new GraphQLInputObjectType({
    name: "StringFilter",
    description:
        "String comparisons. `contains`, `startsWith` and `endsWith` are case-insensitive; `eq` and `ne` are not.",
    fields: () => ({
        eq: { type: GraphQLString },
        ne: { type: GraphQLString },
        in: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
        nin: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
        contains: { type: GraphQLString },
        startsWith: { type: GraphQLString },
        endsWith: { type: GraphQLString },
    }),
});

const IntFilter = numericFilter("IntFilter", GraphQLInt, "Integer comparisons.");

const FloatFilter = numericFilter("FloatFilter", GraphQLFloat, "Floating-point comparisons.");

function numericFilter(
    name: string,
    scalar: GraphQLInputType,
    description: string,
): GraphQLInputObjectType {
    return new GraphQLInputObjectType({
        name,
        description,
        fields: () => ({
            eq: { type: scalar },
            ne: { type: scalar },
            in: { type: new GraphQLList(new GraphQLNonNull(scalar)) },
            nin: { type: new GraphQLList(new GraphQLNonNull(scalar)) },
            gt: { type: scalar },
            gte: { type: scalar },
            lt: { type: scalar },
            lte: { type: scalar },
        }),
    });
}

const BooleanFilter = new GraphQLInputObjectType({
    name: "BooleanFilter",
    description: "Boolean comparisons.",
    fields: () => ({ eq: { type: GraphQLBoolean }, ne: { type: GraphQLBoolean } }),
});

const IDFilter = new GraphQLInputObjectType({
    name: "IDFilter",
    description: "Identifier comparisons.",
    fields: () => ({
        eq: { type: GraphQLID },
        ne: { type: GraphQLID },
        in: { type: new GraphQLList(new GraphQLNonNull(GraphQLID)) },
        nin: { type: new GraphQLList(new GraphQLNonNull(GraphQLID)) },
    }),
});

/**
 * Everything the prelude declares, present in every schema this builds.
 *
 * Kept in step with `PRELUDE` in `sdl.ts` by the round trip in `sdl.test.ts`,
 * which parses the printed SDL and compares it with the schema built here.
 */
const SHARED_VOCABULARY = [
    JSONScalar,
    OrderDirection,
    StringFilter,
    IntFilter,
    FloatFilter,
    BooleanFilter,
    IDFilter,
];

/**
 * The mutable document a single request runs against.
 *
 * One object, threaded as the execution context, so every mutation in one
 * operation sees the ones before it — which GraphQL requires: root mutation
 * fields execute in **serial order**, unlike query fields, precisely so that
 * `createPost` then `deletePost` in one document means what it reads as.
 */
export type ExecutionState = {
    document: JsonDocument;
    /** Set the moment any mutation changes anything, which is what the caller stores. */
    mutated: boolean;
    /** True when the document is at its ceiling, which refuses growth but not deletion. */
    full: boolean;
};

export function buildSchema(model: SchemaModel): GraphQLSchema {
    const objectTypes = new Map<string, GraphQLObjectType>();

    // Built lazily through thunks, because relations are mutually recursive —
    // `Post.comments` needs `Comment` and `Comment.post` needs `Post`. Resolving
    // either eagerly is a reference to a type that does not exist yet.
    for (const resource of model.resources) {
        if (resource.kind === "opaque") {
            continue;
        }

        objectTypes.set(
            resource.resource,
            new GraphQLObjectType({
                name: resource.typeName,
                description: describeResource(resource),
                fields: () => objectFields(resource, objectTypes),
            }),
        );
    }

    const queryFields: GraphQLFieldConfigMap<unknown, ExecutionState> = {};
    const mutationFields: GraphQLFieldConfigMap<unknown, ExecutionState> = {};

    for (const resource of model.resources) {
        if (resource.kind === "opaque") {
            queryFields[resource.queryField] = {
                type: JSONScalar,
                description: `\`${resource.resource}\` is neither a collection of objects nor a lone object, so it is returned exactly as stored.`,
                resolve: (_source, _args, state) => state.document[resource.resource] ?? null,
            };

            continue;
        }

        const type = objectTypes.get(resource.resource) as GraphQLObjectType;

        if (resource.kind === "singular") {
            addSingular(resource, type, queryFields, mutationFields);

            continue;
        }

        addCollection(resource, type, objectTypes, queryFields, mutationFields);
    }

    if (Object.keys(queryFields).length === 0) {
        // `Query` must have at least one field or the schema is invalid, so an
        // empty document gets a placeholder that says what to do about it rather
        // than a schema that fails to construct.
        queryFields._empty = {
            type: GraphQLBoolean,
            description:
                "This server's document publishes nothing queryable yet. Add a collection to it — an array of objects under a top-level key — and this schema will grow a type, a list field and four mutations for it.",
            resolve: () => null,
        };
    }

    return new GraphQLSchema({
        query: new GraphQLObjectType({
            name: "Query",
            description: "Everything this document publishes.",
            fields: queryFields,
        }),
        mutation:
            Object.keys(mutationFields).length === 0
                ? undefined
                : new GraphQLObjectType({
                      name: "Mutation",
                      description:
                          "Writes. Every one of these is refused over `GET`, which the GraphQL-over-HTTP specification reserves for safe requests.",
                      fields: mutationFields,
                  }),
        // The shared vocabulary is pinned rather than left to be discovered by
        // reachability, because otherwise a document with no boolean field
        // produces a schema with no `BooleanFilter` in it — and then the SDL the
        // studio prints, which always carries all five, would not be the schema
        // the endpoint serves. The cross-check in `sdl.test.ts` is what found
        // that; it is also the difference between a client that can generate one
        // set of filter types for every server and one that has to regenerate
        // whenever a field appears.
        types: SHARED_VOCABULARY,
    });
}

function describeResource(resource: CollectionModel | SingularModel): string {
    return resource.kind === "collection"
        ? `Derived from the \`${resource.resource}\` collection — ${resource.recordCount} ${resource.recordCount === 1 ? "record" : "records"}.`
        : `Derived from the \`${resource.resource}\` object. A singular resource: it has no id, so it cannot be created, deleted or listed.`;
}

// ─── object fields ──────────────────────────────────────────────────────────

function objectFields(
    model: ObjectModel,
    objectTypes: ReadonlyMap<string, GraphQLObjectType>,
): GraphQLFieldConfigMap<JsonObject, ExecutionState> {
    const fields: GraphQLFieldConfigMap<JsonObject, ExecutionState> = {};

    for (const field of model.fields) {
        fields[field.name] = {
            type: outputTypeOf(field.type),
            // The published name and the stored key can differ — `full-name`
            // becomes `fullName` — so the resolver always goes through the
            // source key rather than trusting them to be the same.
            resolve: (record) => record[field.sourceKey] ?? null,
        };
    }

    for (const relation of model.relations) {
        fields[relation.name] = relationField(relation, objectTypes);
    }

    return fields;
}

/**
 * A relation, resolved against the live document.
 *
 * A linear scan per parent record, which is O(parents × children) for a `many`
 * relation and is the honest cost of not building an index. It is bounded: a
 * collection is capped at ten thousand records, the parent count is capped by
 * `perPage`, and the node budget in `guard.ts` refuses anything that would
 * multiply those together into real work. Building an index per request would
 * cost more than it saved on every fixture that is not pathological.
 */
function relationField(
    relation: RelationModel,
    objectTypes: ReadonlyMap<string, GraphQLObjectType>,
): GraphQLFieldConfigMap<JsonObject, ExecutionState>[string] {
    const target = objectTypes.get(relation.targetResource) as GraphQLObjectType;

    if (relation.cardinality === "one") {
        return {
            type: target,
            description: `The \`${relation.targetResource}\` record this one's \`${relation.foreignKey}\` points at.`,
            resolve: (record, _args, state) => {
                const wanted = record[relation.foreignKey];

                if (typeof wanted !== "string" && typeof wanted !== "number") {
                    return null;
                }

                const records = collectionOf(state.document, relation.targetResource);
                const index = findIndexById(records, String(wanted));

                return index < 0 ? null : records[index];
            },
        };
    }

    return {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(target))),
        description: `Every \`${relation.targetResource}\` record whose \`${relation.foreignKey}\` points here.`,
        args: {
            page: { type: GraphQLInt },
            perPage: { type: GraphQLInt, defaultValue: DEFAULT_PER_PAGE },
        },
        resolve: (record, args, state) => {
            const id = idOf(record);

            if (id === null) {
                return [];
            }

            const children = collectionOf(state.document, relation.targetResource).filter(
                (child) => String((child as JsonObject)[relation.foreignKey] ?? "") === id,
            ) as JsonObject[];

            return selectRecords(children, args as ListArgs, new Map()).nodes;
        },
    };
}

// ─── collections ────────────────────────────────────────────────────────────

function addCollection(
    model: CollectionModel,
    type: GraphQLObjectType,
    objectTypes: ReadonlyMap<string, GraphQLObjectType>,
    queryFields: GraphQLFieldConfigMap<unknown, ExecutionState>,
    mutationFields: GraphQLFieldConfigMap<unknown, ExecutionState>,
): void {
    const lookup = fieldLookup(model.fields);
    const args = listArguments(model);
    const connection = new GraphQLObjectType({
        name: model.connectionType,
        description: `A page of \`${model.resource}\`, with the total the page was taken from.`,
        fields: {
            nodes: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(type))) },
            total: { type: new GraphQLNonNull(GraphQLInt) },
            page: { type: new GraphQLNonNull(GraphQLInt) },
            perPage: { type: new GraphQLNonNull(GraphQLInt) },
            pages: { type: new GraphQLNonNull(GraphQLInt) },
        },
    });

    queryFields[model.listField] = {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(type))),
        description: `Every matching \`${model.resource}\` record.`,
        args,
        resolve: (_source, given, state) =>
            selectRecords(records(state, model.resource), given as ListArgs, lookup).nodes,
    };

    queryFields[model.singleField] = {
        type,
        description: `One \`${model.resource}\` record by id, or null.`,
        args: { id: { type: new GraphQLNonNull(GraphQLID) } },
        resolve: (_source, given, state) => {
            const held = records(state, model.resource);
            const index = findIndexById(held, String(given.id));

            return index < 0 ? null : held[index];
        },
    };

    queryFields[model.connectionField] = {
        type: new GraphQLNonNull(connection),
        description: `The same as \`${model.listField}\`, wrapped in a page envelope carrying the total.`,
        args,
        resolve: (_source, given, state) =>
            selectRecords(records(state, model.resource), given as ListArgs, lookup),
    };

    const createInput = new GraphQLInputObjectType({
        name: model.createInput,
        description: `A new \`${model.resource}\` record.`,
        fields: () => inputFields(model.fields, true),
    });

    const updateInput = new GraphQLInputObjectType({
        name: model.updateInput,
        description: `Changes to a \`${model.resource}\` record.`,
        fields: () => inputFields(model.fields, false),
    });

    mutationFields[model.mutations.create] = {
        type: new GraphQLNonNull(type),
        description: `Adds a \`${model.resource}\` record and returns it, including the id it was given.`,
        args: { input: { type: new GraphQLNonNull(createInput) } },
        resolve: (_source, given, state) =>
            createRecord(state, model, given.input as Record<string, unknown>),
    };

    mutationFields[model.mutations.update] = {
        type,
        description: "Replaces every field of one record. Fields left out are removed.",
        args: {
            id: { type: new GraphQLNonNull(GraphQLID) },
            input: { type: new GraphQLNonNull(updateInput) },
        },
        resolve: (_source, given, state) =>
            writeRecord(
                state,
                model,
                String(given.id),
                given.input as Record<string, unknown>,
                true,
            ),
    };

    mutationFields[model.mutations.patch] = {
        type,
        description: "Merges into one record. Fields left out are kept.",
        args: {
            id: { type: new GraphQLNonNull(GraphQLID) },
            input: { type: new GraphQLNonNull(updateInput) },
        },
        resolve: (_source, given, state) =>
            writeRecord(
                state,
                model,
                String(given.id),
                given.input as Record<string, unknown>,
                false,
            ),
    };

    mutationFields[model.mutations.remove] = {
        type,
        description: "Removes one record and returns what it was, or null if it was already gone.",
        args: { id: { type: new GraphQLNonNull(GraphQLID) } },
        resolve: (_source, given, state) => removeRecord(state, model, String(given.id)),
    };

    void objectTypes;
}

function listArguments(model: CollectionModel): GraphQLFieldConfigArgumentMap {
    const where = new GraphQLInputObjectType({
        name: model.whereType,
        description: `Filters \`${model.resource}\`. Fields of type \`JSON\` and list fields are absent: no comparison over an arbitrary nested value is meaningful, and one that quietly matched nothing would be worse than none.`,
        fields: () => {
            const fields: GraphQLInputFieldConfigMap = {};

            for (const field of filterableFields(model.fields)) {
                fields[field.name] = { type: filterFor(field.type) };
            }

            fields.AND = { type: new GraphQLList(new GraphQLNonNull(where)) };
            fields.OR = { type: new GraphQLList(new GraphQLNonNull(where)) };
            fields.NOT = { type: where };

            return fields;
        },
    });

    const args: GraphQLFieldConfigArgumentMap = { where: { type: where } };
    const orderable = filterableFields(model.fields);

    if (orderable.length > 0) {
        args.orderBy = {
            type: new GraphQLEnumType({
                name: model.orderByEnum,
                description: `Which field \`${model.resource}\` sorts on.`,
                values: Object.fromEntries(
                    orderable.map((field) => [field.name, { value: field.name }]),
                ),
            }),
        };
        args.order = { type: OrderDirection, defaultValue: "ASC" };
    }

    args.page = { type: GraphQLInt };
    args.perPage = { type: GraphQLInt, defaultValue: DEFAULT_PER_PAGE };

    return args;
}

// ─── singular resources ─────────────────────────────────────────────────────

function addSingular(
    model: SingularModel,
    type: GraphQLObjectType,
    queryFields: GraphQLFieldConfigMap<unknown, ExecutionState>,
    mutationFields: GraphQLFieldConfigMap<unknown, ExecutionState>,
): void {
    queryFields[model.queryField] = {
        type,
        resolve: (_source, _args, state) => state.document[model.resource] ?? null,
    };

    const input = new GraphQLInputObjectType({
        name: model.updateInput,
        description: `Fields of \`${model.resource}\`.`,
        fields: () => inputFields(model.fields, false),
    });

    mutationFields[model.mutations.update] = {
        type: new GraphQLNonNull(type),
        args: { input: { type: new GraphQLNonNull(input) } },
        resolve: (_source, given, state) =>
            writeSingular(state, model, given.input as Record<string, unknown>, true),
    };

    mutationFields[model.mutations.patch] = {
        type: new GraphQLNonNull(type),
        args: { input: { type: new GraphQLNonNull(input) } },
        resolve: (_source, given, state) =>
            writeSingular(state, model, given.input as Record<string, unknown>, false),
    };
}

// ─── writes ─────────────────────────────────────────────────────────────────

/**
 * The size lock, checked at every growing write.
 *
 * A `null` return is not available here — the field is non-null — so a full
 * server throws, which GraphQL turns into an error entry naming the field. That
 * is the right shape: the caller gets told which write was refused rather than
 * receiving a 200 with a silently missing record.
 */
function refuseIfFull(state: ExecutionState): void {
    if (state.full) {
        throw new Error(
            "This server's document is at its size limit. Delete some records to make room; reads and deletes still work.",
        );
    }
}

function createRecord(
    state: ExecutionState,
    model: CollectionModel,
    input: Record<string, unknown>,
): JsonObject {
    refuseIfFull(state);

    const held = records(state, model.resource);
    const seen = new Set<string>();

    for (const record of held) {
        const id = idOf(record);

        if (id !== null) {
            seen.add(id);
        }
    }

    const wanted = input.id;
    const id = typeof wanted === "string" && wanted.length > 0 ? wanted : nextId(seen);

    if (seen.has(id)) {
        throw new Error(`A \`${model.resource}\` record with id "${id}" already exists.`);
    }

    const record: JsonObject = { id, ...toStored(model.fields, input) };

    replaceCollection(state, model.resource, [...held, record]);

    return record;
}

function writeRecord(
    state: ExecutionState,
    model: CollectionModel,
    id: string,
    input: Record<string, unknown>,
    replace: boolean,
): JsonObject | null {
    refuseIfFull(state);

    const held = records(state, model.resource);
    const index = findIndexById(held, id);

    if (index < 0) {
        return null;
    }

    const current = held[index] as JsonObject;
    // The id is carried across explicitly rather than taken from the input,
    // which cannot contain one — moving a record to another address would
    // silently orphan every relation pointing at it.
    const next: JsonObject = replace
        ? { id, ...toStored(model.fields, input) }
        : { ...current, ...toStored(model.fields, input), id };

    replaceCollection(state, model.resource, held.toSpliced(index, 1, next));

    return next;
}

function removeRecord(
    state: ExecutionState,
    model: CollectionModel,
    id: string,
): JsonObject | null {
    // Deliberately not gated on `full`. Deletion is the way out of a full
    // server, and a ceiling with no exit is a trap whose only escape is
    // discarding the whole document — the same rule the REST studio's
    // `isGrowingMethod` encodes.
    const held = records(state, model.resource);
    const index = findIndexById(held, id);

    if (index < 0) {
        return null;
    }

    const removed = held[index] as JsonObject;

    replaceCollection(state, model.resource, held.toSpliced(index, 1));

    return removed;
}

function writeSingular(
    state: ExecutionState,
    model: SingularModel,
    input: Record<string, unknown>,
    replace: boolean,
): JsonObject {
    refuseIfFull(state);

    const current = state.document[model.resource];
    const base = isPlainObject(current) ? current : {};
    const next: JsonObject = replace
        ? toStored(model.fields, input)
        : { ...base, ...toStored(model.fields, input) };

    state.document = { ...state.document, [model.resource]: next };
    state.mutated = true;

    return next;
}

/**
 * Input, keyed back to the document's own field names.
 *
 * The mirror of the read resolvers: a published `fullName` is stored under
 * `full-name`, and writing it back under the published name would produce a
 * record whose shape no longer matches the collection it lives in — and whose
 * next inference would publish *both* keys.
 */
function toStored(fields: readonly FieldModel[], input: Record<string, unknown>): JsonObject {
    const stored: JsonObject = {};

    for (const field of fields) {
        if (field.name === "id" || !(field.name in input)) {
            continue;
        }

        stored[field.sourceKey] = input[field.name] as JsonValue;
    }

    return stored;
}

/**
 * A collection's records.
 *
 * Filtered to plain objects, which for a resource the model calls a collection
 * is a no-op — `resourceKind` only says `collection` when *every* item is one —
 * but is what lets the rest of this file work in `JsonObject` rather than
 * casting at each of the seven places it would otherwise have to. The filter is
 * the assertion, made once, where it can be read.
 */
function records(state: ExecutionState, resource: string): readonly JsonObject[] {
    return collectionOf(state.document, resource).filter(isPlainObject);
}

function collectionOf(document: JsonDocument, resource: string): readonly JsonValue[] {
    const value = document[resource];

    return Array.isArray(value) ? value : [];
}

function replaceCollection(
    state: ExecutionState,
    resource: string,
    next: readonly JsonValue[],
): void {
    state.document = { ...state.document, [resource]: [...next] };
    state.mutated = true;
}

// ─── type mapping ───────────────────────────────────────────────────────────

function outputTypeOf(type: FieldType): GraphQLOutputType {
    const scalar = scalarFor(type.scalar);
    const inner = type.itemsNullable ? scalar : new GraphQLNonNull(scalar);
    const shaped = type.list ? new GraphQLList(inner) : scalar;

    return type.nullable ? shaped : new GraphQLNonNull(shaped);
}

function inputTypeOf(type: FieldType): GraphQLInputType {
    // Every input field is optional, which is what lets one type serve both
    // `update` and `patch` — and what makes a `patch` touching a single key
    // possible at all.
    const scalar = scalarFor(type.scalar);

    return type.list ? new GraphQLList(scalar) : scalar;
}

function inputFields(fields: readonly FieldModel[], withId: boolean): GraphQLInputFieldConfigMap {
    const map: GraphQLInputFieldConfigMap = {};

    if (withId) {
        map.id = {
            type: GraphQLID,
            description: "Optional. One is generated when it is left out.",
        };
    }

    for (const field of fields) {
        if (field.name === "id") {
            continue;
        }

        map[field.name] = { type: inputTypeOf(field.type) };
    }

    if (Object.keys(map).length === 0) {
        // An input object with no fields is invalid GraphQL. A collection whose
        // records hold nothing but an id lands here.
        map.id = {
            type: GraphQLID,
            description: "Ignored. A record's id never changes.",
        };
    }

    return map;
}

function scalarFor(scalar: FieldType["scalar"]): GraphQLScalarType | typeof GraphQLString {
    switch (scalar) {
        case "ID":
            return GraphQLID;
        case "Int":
            return GraphQLInt;
        case "Float":
            return GraphQLFloat;
        case "Boolean":
            return GraphQLBoolean;
        case "JSON":
            return JSONScalar;
        default:
            return GraphQLString;
    }
}

function filterFor(type: FieldType): GraphQLInputObjectType {
    switch (type.scalar) {
        case "ID":
            return IDFilter;
        case "Int":
            return IntFilter;
        case "Float":
            return FloatFilter;
        case "Boolean":
            return BooleanFilter;
        default:
            return StringFilter;
    }
}

export { collectionsOf };
