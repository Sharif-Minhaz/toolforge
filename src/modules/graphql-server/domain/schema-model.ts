import { isRoutableName, resourceKind } from "@/modules/tools/domain/json-document";
import type { JsonDocument, JsonObject, JsonValue } from "@/modules/tools/types/json-document";

import { inferFields, inferSingularFields } from "./infer";
import { pluralize, singularize, toFieldName, toTypeName, uniqueName } from "./naming";
import type {
    CollectionModel,
    FieldModel,
    OpaqueModel,
    RelationModel,
    RenamedResource,
    ResourceModel,
    SchemaModel,
    SingularModel,
    SkippedResource,
} from "../types";

/**
 * The schema, derived from the document rather than authored.
 *
 * This is the whole promise of the tool — you supply data and the API appears —
 * so the one property that has to hold is the same one the REST studio's route
 * table has: **what the studio prints and what the endpoint answers come from
 * this one function.** Two derivations would drift, and the way it would show up
 * is the worst kind: a field printed in the SDL that errors as unknown.
 *
 * It returns plain data, deliberately. `graphql-js` is a server-side dependency
 * and `domain/` is reachable from the client bundle, so the *model* is what the
 * studio renders and what `bun test` asserts on, and `domain/execute.ts` is the
 * only file that turns it into a real `GraphQLSchema`. That seam is the same one
 * the Mock Server Studio draws around `@faker-js/faker`, for the same reason.
 *
 * Every name it produces is deterministic in the document's key order, because
 * an SDL people check into a repository must not churn between two reads of the
 * same file.
 */

/** Everything GraphQL or this schema already owns, which a resource may not take. */
const RESERVED_TYPE_NAMES: readonly string[] = [
    "Query",
    "Mutation",
    "Subscription",
    "String",
    "Int",
    "Float",
    "Boolean",
    "ID",
    "JSON",
    "OrderDirection",
    "StringFilter",
    "IntFilter",
    "FloatFilter",
    "BooleanFilter",
    "IDFilter",
    "PageInfo",
];

export function buildSchemaModel(document: JsonDocument): SchemaModel {
    const skipped: SkippedResource[] = [];
    const renamed: RenamedResource[] = [];

    // One namespace for types and one for root fields, because GraphQL keeps
    // them apart: a type `Post` and a query field `post` do not collide, and
    // forcing them into one pool would rename things that were never in
    // conflict.
    const typeNames = new Set<string>(RESERVED_TYPE_NAMES);
    const queryFields = new Set<string>();
    const mutationFields = new Set<string>();

    const named: NamedResource[] = [];

    for (const resource of Object.keys(document)) {
        // A key with a slash or a question mark in it is not publishable in
        // either studio. Kept in the document and served inside its parent —
        // exactly as the REST studio does — and reported rather than dropped
        // silently, because "my collection vanished" is the reading otherwise.
        if (!isRoutableName(resource)) {
            skipped.push({ resource, reason: "unroutable_name" });

            continue;
        }

        const field = toFieldName(resource);
        const type = toTypeName(resource);

        if (field === null || type === null) {
            skipped.push({ resource, reason: "unnameable" });

            continue;
        }

        if (field !== resource) {
            renamed.push({
                resource,
                published: field,
                reason: /^[0-9]/u.test(resource) ? "leading_digit" : "invalid_characters",
            });
        }

        named.push({ resource, field, type, value: document[resource] });
    }

    const resources: ResourceModel[] = [];

    for (const entry of named) {
        const kind = resourceKind(entry.value);

        if (kind === "opaque") {
            const queryField = claim(entry.field, queryFields);

            note(renamed, entry.resource, queryField, entry.field);
            resources.push({ kind: "opaque", resource: entry.resource, queryField });

            continue;
        }

        const singularFields = kind === "singular" ? inferSingularFields(entry.value) : [];

        if (kind === "singular" && singularFields.length === 0) {
            // `{"profile": {}}`. A GraphQL type with no fields is a syntax
            // error, and a lone object has no `id` to fall back on the way a
            // collection does — so this is published as opaque, readable as
            // `JSON`, and reported so the studio can say that adding a key turns
            // it into a real type. Refusing the document instead would be this
            // tool telling somebody their data may not be empty.
            //
            // Decided *before* a type name is claimed, or an empty object would
            // reserve a name it never publishes and push the next resource that
            // wanted it to a suffix.
            skipped.push({ resource: entry.resource, reason: "no_fields" });
            resources.push({
                kind: "opaque",
                resource: entry.resource,
                queryField: claim(entry.field, queryFields),
            });

            continue;
        }

        const typeName = claim(entry.type, typeNames);

        note(renamed, entry.resource, typeName, entry.type);

        if (kind === "singular") {
            const queryField = claim(entry.field, queryFields);

            resources.push({
                kind: "singular",
                resource: entry.resource,
                typeName,
                fields: singularFields,
                // A singular resource has no id, so nothing can point at it and
                // it can point at nothing. Relations are a foreign-key idea and
                // a lone object has no key to be foreign to.
                relations: [],
                queryField,
                updateInput: claim(`${typeName}Input`, typeNames),
                mutations: {
                    update: claim(`update${typeName}`, mutationFields),
                    patch: claim(`patch${typeName}`, mutationFields),
                },
            } satisfies SingularModel);

            continue;
        }

        const records = entry.value as JsonObject[];
        const listField = claim(entry.field, queryFields);
        const singleField = claim(singularize(entry.field), queryFields);

        resources.push({
            kind: "collection",
            resource: entry.resource,
            typeName,
            fields: inferFields(records),
            // Filled in below: a relation needs every other resource's name, so
            // it cannot be derived while the names are still being assigned.
            relations: [],
            listField,
            singleField,
            connectionField: claim(`${listField}Connection`, queryFields),
            connectionType: claim(`${typeName}Connection`, typeNames),
            whereType: claim(`${typeName}Where`, typeNames),
            orderByEnum: claim(`${typeName}OrderByField`, typeNames),
            createInput: claim(`${typeName}CreateInput`, typeNames),
            updateInput: claim(`${typeName}UpdateInput`, typeNames),
            mutations: {
                create: claim(`create${typeName}`, mutationFields),
                update: claim(`update${typeName}`, mutationFields),
                patch: claim(`patch${typeName}`, mutationFields),
                remove: claim(`delete${typeName}`, mutationFields),
            },
            recordCount: records.length,
        } satisfies CollectionModel);
    }

    const linked = linkRelations(resources);

    return {
        resources: linked,
        skipped,
        renamed,
        isEmpty: linked.length === 0,
    };
}

type NamedResource = {
    readonly resource: string;
    readonly field: string;
    readonly type: string;
    readonly value: JsonValue;
};

function claim(wanted: string, taken: Set<string>): string {
    const name = uniqueName(wanted, taken);

    taken.add(name);

    return name;
}

/** Records a rename only when one actually happened. */
function note(into: RenamedResource[], resource: string, got: string, wanted: string): void {
    if (got !== wanted) {
        into.push({ resource, published: got, reason: "collision" });
    }
}

/**
 * The relations, derived from foreign keys once every name is settled.
 *
 * The rule is `json-server`'s, because it is the convention fixtures already
 * follow and inventing a second one would mean a document that works in the REST
 * studio produces no relations here: **a field named `<singular-of-collection>Id`
 * on record A pointing at collection B makes A a child of B.** So
 * `comments.postId` against a `posts` collection publishes both directions —
 * `Comment.post: Post` and `Post.comments: [Comment!]!` — which is the single
 * thing GraphQL buys over the REST studio's `_embed`, since a caller gets both
 * ends in one round trip and picks the fields on each.
 *
 * Three rules keep it from producing fields nobody asked for:
 *
 * - **The foreign key must actually be present on the child**, as an inferred
 *   field. A `postId` that no record carries is not a relation, it is a guess.
 * - **A relation never overwrites a stored field.** If a collection already has
 *   a key literally called `post`, that value wins and the relation is not
 *   published — the document is the source of truth, and shadowing one of its
 *   fields with a derived one would make a value unreachable.
 * - **The reverse field is only added when its name is free**, for the same
 *   reason and by the same test.
 */
function linkRelations(resources: readonly ResourceModel[]): readonly ResourceModel[] {
    const collections = resources.filter(
        (resource): resource is CollectionModel => resource.kind === "collection",
    );

    // Keyed by the *published* list field, which is what `pluralize` produces
    // and therefore what a foreign key resolves against.
    const byListField = new Map(
        collections.map((collection) => [collection.listField, collection]),
    );

    const relations = new Map<string, RelationModel[]>();

    function add(resource: string, relation: RelationModel): void {
        const held = relations.get(resource) ?? [];

        held.push(relation);
        relations.set(resource, held);
    }

    for (const child of collections) {
        for (const field of child.fields) {
            const parentSingular = foreignKeyOwner(field.name);

            if (parentSingular === null) {
                continue;
            }

            const parent = byListField.get(pluralize(parentSingular));

            if (parent === undefined || parent.resource === child.resource) {
                // A self-reference — `posts.postId` — is skipped rather than
                // published. It is almost always a mistake in the fixture, and
                // where it is not, the cycle it creates is exactly the shape
                // `MAX_QUERY_DEPTH` exists to bound.
                continue;
            }

            if (!isFree(parentSingular, child.fields, relations.get(child.resource))) {
                continue;
            }

            add(child.resource, {
                name: parentSingular,
                cardinality: "one",
                targetResource: parent.resource,
                targetType: parent.typeName,
                foreignKey: field.name,
            });

            if (!isFree(child.listField, parent.fields, relations.get(parent.resource))) {
                continue;
            }

            add(parent.resource, {
                name: child.listField,
                cardinality: "many",
                targetResource: child.resource,
                targetType: child.typeName,
                foreignKey: field.name,
            });
        }
    }

    return resources.map((resource) =>
        resource.kind === "opaque"
            ? resource
            : { ...resource, relations: relations.get(resource.resource) ?? [] },
    );
}

/** `postId` → `post`; anything not ending in a capital-I `Id` → null. */
function foreignKeyOwner(field: string): string | null {
    if (!field.endsWith("Id") || field.length <= 2) {
        return null;
    }

    return field.slice(0, -2);
}

function isFree(
    name: string,
    fields: readonly FieldModel[],
    existing: readonly RelationModel[] | undefined,
): boolean {
    return (
        !fields.some((field) => field.name === name) &&
        !(existing ?? []).some((relation) => relation.name === name)
    );
}

/** Every collection, for callers that only care about the mutable resources. */
export function collectionsOf(model: SchemaModel): readonly CollectionModel[] {
    return model.resources.filter(
        (resource): resource is CollectionModel => resource.kind === "collection",
    );
}

export function findResource(model: SchemaModel, resource: string): ResourceModel | undefined {
    return model.resources.find((entry) => entry.resource === resource);
}

export type { OpaqueModel };
