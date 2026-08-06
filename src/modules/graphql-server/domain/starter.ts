import { DEFAULT_PER_PAGE } from "./constants";
import type { CollectionModel, FieldModel, ResourceModel, SchemaModel } from "../types";

/**
 * A runnable query, generated from the schema the document produced.
 *
 * This exists because of a failure the REST studio does not have. There, a fresh
 * server is immediately usable: the route table is printed, and `GET /posts` is
 * a thing anybody can type into a browser. A fresh GraphQL endpoint is a box
 * that answers nothing until you have read the schema and written a selection
 * set — so the first thing a visitor meets is a blank editor above an endpoint
 * that rejects every empty request. That is a tool that works and feels broken.
 *
 * So the studio's editor opens holding a query that runs against *this* document,
 * naming *these* fields. It is not a placeholder or an example from the article;
 * it is derived from the same model the endpoint serves, so pressing Run without
 * touching it returns real data from the reader's own fixture.
 *
 * Three rules keep it useful rather than merely present:
 *
 * - **It is small.** The first collection, a handful of its fields, and one
 *   relation if there is one. A query that selected everything would be a wall
 *   of text nobody edits, and would teach nothing about the shape.
 * - **It shows the thing that is worth showing.** Where a relation exists, it is
 *   in the query, because fetching both ends in one round trip is the entire
 *   reason to reach for this studio over the REST one.
 * - **It is deterministic.** The same document always produces the same query,
 *   so the editor's contents do not shuffle between two loads of one page.
 */

/** How many scalar fields a generated selection names before it stops. */
const FIELD_BUDGET = 4;

export function buildStarterQuery(model: SchemaModel): string {
    const collection = model.resources.find(
        (resource): resource is CollectionModel => resource.kind === "collection",
    );

    if (collection !== undefined) {
        return collectionQuery(collection);
    }

    const singular = model.resources.find((resource) => resource.kind === "singular");

    if (singular !== undefined && singular.kind === "singular") {
        return `query Example {\n  ${singular.queryField} {\n${selection(singular.fields, "    ")}\n  }\n}\n`;
    }

    const opaque = model.resources.find((resource) => resource.kind === "opaque");

    if (opaque !== undefined && opaque.kind === "opaque") {
        return `query Example {\n  ${opaque.queryField}\n}\n`;
    }

    // Nothing publishable. The endpoint still answers introspection, so the
    // starter is the query that proves it is alive and shows what to do next.
    return `# This server's document publishes nothing queryable yet.\n# Add a collection to it — an array of objects under a top-level key —\n# and this query will be replaced by one that runs against it.\nquery Schema {\n  __schema {\n    queryType {\n      name\n    }\n  }\n}\n`;
}

function collectionQuery(model: CollectionModel): string {
    const lines: string[] = [`query Example {`];

    // The connection rather than the plain list, because `total` is the number
    // somebody actually wants first — "how much is in here" — and seeing the
    // envelope once is how a reader learns it exists.
    lines.push(`  ${model.connectionField}(perPage: ${Math.min(DEFAULT_PER_PAGE, 3)}) {`);
    lines.push(`    total`);
    lines.push(`    pages`);
    lines.push(`    nodes {`);
    lines.push(selection(model.fields, "      "));

    const relation = model.relations[0];

    if (relation !== undefined) {
        lines.push(
            relation.cardinality === "many"
                ? `      ${relation.name}(perPage: 2) {\n        id\n      }`
                : `      ${relation.name} {\n        id\n      }`,
        );
    }

    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`}`);

    return `${lines.join("\n")}\n`;
}

/**
 * A few of a type's fields, `id` first.
 *
 * `JSON` and list fields are skipped where there is anything else to show: a
 * generated example whose first line is a nested blob teaches less than one
 * naming three ordinary scalars, and both are one edit away for whoever wants
 * the other.
 */
function selection(fields: readonly FieldModel[], indent: string): string {
    const plain = fields.filter((field) => !field.type.list && field.type.scalar !== "JSON");
    const chosen = (plain.length > 0 ? plain : fields).slice(0, FIELD_BUDGET);

    if (chosen.length === 0) {
        return `${indent}__typename`;
    }

    return chosen.map((field) => `${indent}${field.name}`).join("\n");
}

/** Every resource, for callers that want to know whether anything was published. */
export function hasQueryableResource(resources: readonly ResourceModel[]): boolean {
    return resources.length > 0;
}
