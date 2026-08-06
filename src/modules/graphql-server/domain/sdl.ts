import { DEFAULT_PER_PAGE, MAX_PER_PAGE } from "./constants";
import type {
    CollectionModel,
    FieldModel,
    FieldType,
    GraphqlScalar,
    RelationModel,
    ResourceModel,
    SchemaModel,
    SingularModel,
} from "../types";

/**
 * The schema model, written out as SDL.
 *
 * Written by hand rather than by `printSchema` from `graphql-js`, and the reason
 * is the seam rather than a preference: this text is shown in the studio and
 * offered as a `schema.graphql` download, so it has to be producible without
 * pulling the reference implementation into the client bundle. `execute.ts`
 * builds the real `GraphQLSchema` from the same model, and the two are held
 * together by a test that parses this output and compares it with what
 * `printSchema` gives for the schema built from the same document — which is the
 * "check against something that is not you" rule applied to a printer.
 *
 * Descriptions are included because they are most of what makes a generated
 * schema usable: somebody who opens this in an IDE gets told which `db.json` key
 * each type came from and how many records it had, which is exactly the context
 * a derived API otherwise loses.
 */

const INDENT = "  ";

/**
 * The shared vocabulary, printed once above everything derived.
 *
 * The filter inputs are the reason this studio is worth using over the REST one
 * for anything but the simplest read. `?views:gt=100` in the REST studio is a
 * convention a caller has to be told about; `views: { gt: 100 }` here is *in the
 * schema*, so every IDE completes it and every codegen types it.
 */
const PRELUDE = `"""
An arbitrary JSON value: an object, a mixed-type field, or a nested array.

Present because the JSON data model has shapes GraphQL's built-in scalars
cannot name. A field of this type is returned exactly as it is stored.
"""
scalar JSON

"Which way a sort runs."
enum OrderDirection {
  ASC
  DESC
}

"""
String comparisons.

\`contains\`, \`startsWith\` and \`endsWith\` are case-insensitive; \`eq\` and \`ne\`
are not. That split matches the REST studio's query language, so a fixture
behaves the same whichever way it is served.
"""
input StringFilter {
  eq: String
  ne: String
  in: [String!]
  nin: [String!]
  contains: String
  startsWith: String
  endsWith: String
}

"Integer comparisons."
input IntFilter {
  eq: Int
  ne: Int
  in: [Int!]
  nin: [Int!]
  gt: Int
  gte: Int
  lt: Int
  lte: Int
}

"Floating-point comparisons."
input FloatFilter {
  eq: Float
  ne: Float
  in: [Float!]
  nin: [Float!]
  gt: Float
  gte: Float
  lt: Float
  lte: Float
}

"Boolean comparisons."
input BooleanFilter {
  eq: Boolean
  ne: Boolean
}

"Identifier comparisons."
input IDFilter {
  eq: ID
  ne: ID
  in: [ID!]
  nin: [ID!]
}`;

export function renderSdl(model: SchemaModel): string {
    if (model.isEmpty) {
        // A schema with no fields is not valid GraphQL — `Query` must have at
        // least one — so an empty document produces a schema that says so rather
        // than one that fails to parse. The studio renders the same sentence.
        return `${PRELUDE}\n\ntype Query {\n${INDENT}"""\n${INDENT}This server's document publishes nothing queryable yet. Add a collection\n${INDENT}to it — an array of objects under a top-level key — and this schema will\n${INDENT}grow a type, a list field and four mutations for it.\n${INDENT}"""\n${INDENT}_empty: Boolean\n}\n`;
    }

    const blocks: string[] = [PRELUDE];

    for (const resource of model.resources) {
        if (resource.kind === "collection") {
            blocks.push(...collectionBlocks(resource));
        } else if (resource.kind === "singular") {
            blocks.push(...singularBlocks(resource));
        }
    }

    blocks.push(queryBlock(model));

    const mutation = mutationBlock(model);

    if (mutation !== null) {
        blocks.push(mutation);
    }

    return `${blocks.join("\n\n")}\n`;
}

// ─── types ──────────────────────────────────────────────────────────────────

function collectionBlocks(model: CollectionModel): readonly string[] {
    const blocks = [
        objectType(
            model.typeName,
            `Derived from the \`${model.resource}\` collection — ${model.recordCount} ${
                model.recordCount === 1 ? "record" : "records"
            }.`,
            model.fields,
            model.relations,
        ),
        connectionType(model),
        whereInput(model),
    ];

    const orderBy = orderByEnum(model);

    if (orderBy !== null) {
        blocks.push(orderBy);
    }

    blocks.push(createInput(model), updateInput(model));

    return blocks;
}

function singularBlocks(model: SingularModel): readonly string[] {
    return [
        objectType(
            model.typeName,
            `Derived from the \`${model.resource}\` object. A singular resource: it has no id, so it cannot be created, deleted or listed.`,
            model.fields,
            model.relations,
        ),
        block(
            `input ${model.updateInput}`,
            model.fields.map((field) => `${field.name}: ${renderType(nullableOf(field.type))}`),
            `Fields of \`${model.resource}\`. Every one is optional: \`update\` replaces the object with exactly what is given, \`patch\` merges.`,
        ),
    ];
}

function objectType(
    name: string,
    description: string,
    fields: readonly FieldModel[],
    relations: readonly RelationModel[],
): string {
    const lines = fields.map((field) => `${field.name}: ${renderType(field.type)}`);

    for (const relation of relations) {
        lines.push(relationField(relation));
    }

    return block(`type ${name}`, lines, description);
}

/**
 * A relation field, and why the `many` side takes arguments.
 *
 * A post with four thousand comments is a field that has to be pageable or it is
 * a field nobody can use — and without a page size the node estimator would have
 * to assume the worst for every relation, which would refuse queries that are
 * perfectly reasonable. The arguments are the same ones the root list field
 * takes, resolved by the same code.
 */
function relationField(relation: RelationModel): string {
    if (relation.cardinality === "one") {
        return `"The \`${relation.targetResource}\` record this one's \`${relation.foreignKey}\` points at."\n${INDENT}${relation.name}: ${relation.targetType}`;
    }

    return `"Every \`${relation.targetResource}\` record whose \`${relation.foreignKey}\` points here."\n${INDENT}${relation.name}(${listArgs(relation.targetType)}): [${relation.targetType}!]!`;
}

function connectionType(model: CollectionModel): string {
    return block(
        `type ${model.connectionType}`,
        [
            `"The records on this page."\n${INDENT}nodes: [${model.typeName}!]!`,
            `"How many records matched the filter, before paging."\n${INDENT}total: Int!`,
            `"The page returned, 1-based."\n${INDENT}page: Int!`,
            `perPage: Int!`,
            `"How many pages the filtered set has at this page size. Zero when nothing matched."\n${INDENT}pages: Int!`,
        ],
        `A page of \`${model.resource}\`, with the total the page was taken from — which is the number a "showing 10 of 200" needs and which the plain list field cannot give you.`,
    );
}

function whereInput(model: CollectionModel): string {
    const lines = filterableFields(model.fields).map(
        (field) => `${field.name}: ${filterTypeFor(field.type.scalar)}`,
    );

    lines.push(
        `"Every clause must match."\n${INDENT}AND: [${model.whereType}!]`,
        `"At least one clause must match."\n${INDENT}OR: [${model.whereType}!]`,
        `"The clause must not match."\n${INDENT}NOT: ${model.whereType}`,
    );

    return block(
        `input ${model.whereType}`,
        lines,
        `Filters \`${model.resource}\`. Fields of type \`JSON\` and list fields are absent: there is no comparison that is meaningful for an arbitrary nested value, and offering one that quietly matched nothing would be worse than not offering it.`,
    );
}

function orderByEnum(model: CollectionModel): string | null {
    const fields = filterableFields(model.fields);

    if (fields.length === 0) {
        // An enum with no members is invalid GraphQL, so the whole thing is
        // omitted and `orderBy` disappears from the arguments with it.
        return null;
    }

    return block(
        `enum ${model.orderByEnum}`,
        fields.map((field) => field.name),
        `Which field \`${model.resource}\` sorts on. Strings compare with \`localeCompare\`, so "a title" sorts before "Tenth" — the same order the REST studio uses.`,
    );
}

function createInput(model: CollectionModel): string {
    const lines = model.fields
        .filter((field) => field.name !== "id")
        .map((field) => `${field.name}: ${renderType(nullableOf(field.type))}`);

    // `id` is accepted on create and refused on update, which is exactly the
    // REST studio's rule: a caller may choose the address of a record it is
    // creating, and may never move one that already exists.
    lines.unshift(`"Optional. One is generated when it is left out."\n${INDENT}id: ID`);

    return block(
        `input ${model.createInput}`,
        lines,
        `A new \`${model.resource}\` record. Fields are those the collection already has — to add a field the schema does not know about, edit the document in the studio.`,
    );
}

function updateInput(model: CollectionModel): string {
    const lines = model.fields
        .filter((field) => field.name !== "id")
        .map((field) => `${field.name}: ${renderType(nullableOf(field.type))}`);

    if (lines.length === 0) {
        // A collection whose records hold nothing but an id. The input still has
        // to have a member to be valid, and `id` is the honest one to offer even
        // though the mutation ignores it.
        lines.push(
            `"Ignored. A record's id never changes; ask for the record you mean by id."\n${INDENT}id: ID`,
        );
    }

    return block(
        `input ${model.updateInput}`,
        lines,
        `Changes to a \`${model.resource}\` record. \`update\` replaces every field with what is given; \`patch\` merges. The id is not here on purpose: moving a record to another address would silently orphan everything pointing at it.`,
    );
}

// ─── roots ──────────────────────────────────────────────────────────────────

function queryBlock(model: SchemaModel): string {
    const lines: string[] = [];

    for (const resource of model.resources) {
        lines.push(...queryFields(resource));
    }

    return block("type Query", lines, "Everything this document publishes.");
}

function queryFields(resource: ResourceModel): readonly string[] {
    if (resource.kind === "opaque") {
        return [
            `"\`${resource.resource}\` is neither a collection of objects nor a lone object, so it is returned exactly as stored and nothing more."\n${INDENT}${resource.queryField}: JSON`,
        ];
    }

    if (resource.kind === "singular") {
        return [`${resource.queryField}: ${resource.typeName}`];
    }

    return [
        `"Every matching \`${resource.resource}\` record."\n${INDENT}${resource.listField}(${listArgs(resource.typeName, resource)}): [${resource.typeName}!]!`,
        `"One \`${resource.resource}\` record by id, or null."\n${INDENT}${resource.singleField}(id: ID!): ${resource.typeName}`,
        `"The same as \`${resource.listField}\`, wrapped in a page envelope carrying the total."\n${INDENT}${resource.connectionField}(${listArgs(resource.typeName, resource)}): ${resource.connectionType}!`,
    ];
}

function mutationBlock(model: SchemaModel): string | null {
    const lines: string[] = [];

    for (const resource of model.resources) {
        if (resource.kind === "collection") {
            lines.push(
                `"Adds a \`${resource.resource}\` record and returns it, including the id it was given."\n${INDENT}${resource.mutations.create}(input: ${resource.createInput}!): ${resource.typeName}!`,
                `"Replaces every field of one record. Fields left out are removed."\n${INDENT}${resource.mutations.update}(id: ID!, input: ${resource.updateInput}!): ${resource.typeName}`,
                `"Merges into one record. Fields left out are kept."\n${INDENT}${resource.mutations.patch}(id: ID!, input: ${resource.updateInput}!): ${resource.typeName}`,
                `"Removes one record and returns what it was, or null if it was already gone."\n${INDENT}${resource.mutations.remove}(id: ID!): ${resource.typeName}`,
            );
        } else if (resource.kind === "singular") {
            lines.push(
                `${resource.mutations.update}(input: ${resource.updateInput}!): ${resource.typeName}!`,
                `${resource.mutations.patch}(input: ${resource.updateInput}!): ${resource.typeName}!`,
            );
        }
    }

    if (lines.length === 0) {
        // A document of nothing but opaque values has nothing to mutate, and a
        // `Mutation` type with no fields is invalid GraphQL.
        return null;
    }

    return block(
        "type Mutation",
        lines,
        "Writes. Every one of these is refused over `GET`, which the GraphQL-over-HTTP specification reserves for safe requests.",
    );
}

/**
 * The arguments every list-shaped field takes.
 *
 * One spelling, used by the root list, the connection and the `many` side of
 * every relation, so a caller learns it once. `orderBy` is dropped where the
 * type has no orderable field, because naming an enum that was not printed is
 * how a generated schema fails to parse.
 */
function listArgs(_typeName: string, model?: CollectionModel): string {
    if (model === undefined) {
        return `page: Int, perPage: Int = ${DEFAULT_PER_PAGE}`;
    }

    const args = [`where: ${model.whereType}`];

    if (filterableFields(model.fields).length > 0) {
        args.push(`orderBy: ${model.orderByEnum}`, "order: OrderDirection = ASC");
    }

    args.push("page: Int", `perPage: Int = ${DEFAULT_PER_PAGE}`);

    return args.join(", ");
}

// ─── shared ─────────────────────────────────────────────────────────────────

/**
 * Fields a filter or a sort can be built on.
 *
 * A `JSON` field is excluded because there is no comparison over an arbitrary
 * value that means anything, and a list field because "is this array greater
 * than 100" is a question with no answer. Both would have to silently match
 * nothing, and a filter that quietly matches nothing is worse than an absent one
 * — the caller gets an empty result and no reason.
 */
export function filterableFields(fields: readonly FieldModel[]): readonly FieldModel[] {
    return fields.filter((field) => !field.type.list && field.type.scalar !== "JSON");
}

export function filterTypeFor(scalar: GraphqlScalar): string {
    switch (scalar) {
        case "ID":
            return "IDFilter";
        case "Int":
            return "IntFilter";
        case "Float":
            return "FloatFilter";
        case "Boolean":
            return "BooleanFilter";
        default:
            return "StringFilter";
    }
}

/** `String`, `String!`, `[String!]!` — the four shapes a field type prints as. */
export function renderType(type: FieldType): string {
    if (!type.list) {
        return type.nullable ? type.scalar : `${type.scalar}!`;
    }

    const item = type.itemsNullable ? type.scalar : `${type.scalar}!`;

    return type.nullable ? `[${item}]` : `[${item}]!`;
}

/**
 * The same type with every `!` removed.
 *
 * Input fields are all optional, which is what makes one input type serve both
 * `update` and `patch`. A required input field would also make a `patch` that
 * touches one key impossible.
 */
function nullableOf(type: FieldType): FieldType {
    return { ...type, nullable: true, itemsNullable: true };
}

function block(header: string, lines: readonly string[], description?: string): string {
    const body = lines.map((line) => `${INDENT}${line}`).join("\n");

    return description === undefined
        ? `${header} {\n${body}\n}`
        : `${describe(description)}\n${header} {\n${body}\n}`;
}

/**
 * A description, as a GraphQL block string.
 *
 * Every description here is built from resource and field names, which
 * `RESOURCE_NAME_PATTERN` and GraphQL's own `Name` grammar have already narrowed
 * to alphanumerics — so a `"""` cannot appear. The replacement is here anyway,
 * because this function is the only thing between a stored key and a file other
 * people parse, and "it cannot happen" is not a property this file gets to
 * assume about somebody else's document.
 */
function describe(text: string): string {
    return `"""\n${text.replaceAll('"""', '\\"""')}\n"""`;
}

export { MAX_PER_PAGE };
