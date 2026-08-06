import { getByteLength } from "@/modules/tools/domain/byte-size";
import { MAX_DOCUMENT_BYTES } from "@/modules/tools/domain/document-limits";
import { writeDocument } from "@/modules/tools/domain/json-document";
import type { JsonDocument } from "@/modules/tools/types/json-document";
import {
    execute as runGraphql,
    getOperationAST,
    GraphQLError,
    parse,
    specifiedRules,
    validate,
    type DocumentNode,
    type OperationDefinitionNode,
} from "graphql";

import { MAX_QUERY_LENGTH } from "./constants";
import { analyzeOperation, type Analysis } from "./guard";
import { buildSchemaModel } from "./schema-model";
import { buildSchema, type ExecutionState } from "./schema-build";
import type { GraphqlError, GraphqlOutcome, GraphqlRequest } from "../types";

/**
 * The whole GraphQL engine, as two pure functions over a document.
 *
 * **This file and `guard.ts` are the only two in this module that import
 * `graphql`, and neither may ever be imported by a client component.**
 *
 * It is split in two — `planRequest` then `executeRequest` — rather than being
 * one call, and the split is load-bearing rather than tidy. The REST studio can
 * tell a read from a write by looking at the HTTP method, so its repository
 * knows before it queries whether to take a row lock. **Every GraphQL request is
 * a `POST`**, so the only thing that can answer "does this write" is the parsed
 * operation. Planning first means the document is parsed exactly once, the lock
 * is taken only for a genuine mutation, and the overwhelmingly common case — a
 * query — is answered from a plain read.
 *
 * The gates inside `executeRequest` run cheapest-first, which is the same
 * ordering every other server-backed tool here uses and for the same reason:
 *
 * 1. **Length** — a string comparison. A megabyte of query text is refused
 *    before the parser is asked to look at it.
 * 2. **Parse** — syntax only.
 * 3. **The transport's rights** — a mutation over `GET` is refused here, after
 *    parsing (which is the first moment it is knowable) and before anything
 *    expensive.
 * 4. **Validation**, with `graphql-js`'s own `specifiedRules`. This is what
 *    rejects unknown fields, wrong argument types and cyclic fragments — and the
 *    last of those is why it must run *before* the guard, whose walker follows
 *    fragment spreads and would not terminate on a fragment that spreads itself.
 * 5. **The guard** — depth, node cost and root-field count, all from the query
 *    alone. See `guard.ts`.
 * 6. **Execution.**
 */

export type RequestPlan =
    | {
          readonly ok: true;
          readonly ast: DocumentNode;
          readonly operation: OperationDefinitionNode;
          /** What the repository reads to decide between a plain read and a row lock. */
          readonly isMutation: boolean;
          readonly operationName: string | null;
      }
    | { readonly ok: false; readonly reason: GraphqlError; readonly message: string };

/**
 * Reads the request far enough to know what it is, and no further.
 *
 * Deliberately does **not** validate against the schema. Validation needs a
 * schema, a schema needs the document, and reading the document is the thing
 * this call exists to decide how to do. Whether a query names a field that
 * exists is a question for `executeRequest`, which has the document in hand.
 */
export function planRequest(request: GraphqlRequest): RequestPlan {
    if (request.query.trim().length === 0) {
        return { ok: false, reason: "missing_query", message: "No query was supplied." };
    }

    if (request.query.length > MAX_QUERY_LENGTH) {
        return {
            ok: false,
            reason: "query_too_long",
            // Refused rather than truncated: half a GraphQL document is not a
            // smaller query, it is a syntax error, and answering with a parse
            // failure would blame the caller for something this server did.
            message: `The query is longer than ${MAX_QUERY_LENGTH} characters.`,
        };
    }

    let ast: DocumentNode;

    try {
        ast = parse(request.query);
    } catch (caught) {
        return {
            ok: false,
            reason: "parse_failed",
            // Safe to render, unlike `JSON.parse`'s. A `GraphQLError` comes from
            // a pinned dependency rather than from the host engine, so it reads
            // the same on every runtime — the same reason `ToonDecodeError` is
            // rendered in the BSON tool and V8's parser message is not.
            message:
                caught instanceof GraphQLError ? caught.message : "The query could not be parsed.",
        };
    }

    // `getOperationAST` answers `undefined` for both "no operation at all" and
    // "several, and you did not say which", which are one refusal here — the
    // caller has to name one either way.
    const operation = getOperationAST(ast, request.operationName ?? undefined);

    if (operation === null || operation === undefined) {
        return {
            ok: false,
            reason: "validation_failed",
            message:
                request.operationName === null
                    ? "The document has no operation to run, or has several and did not say which."
                    : `The document has no operation named "${request.operationName}".`,
        };
    }

    if (operation.operation === "subscription") {
        return {
            ok: false,
            reason: "validation_failed",
            // Not a limitation worth apologising for: a subscription needs a
            // transport that stays open, and a stored fixture has no events to
            // push. Saying so beats a schema that advertises one and never fires.
            message: "Subscriptions are not supported. This server has nothing to push.",
        };
    }

    return {
        ok: true,
        ast,
        operation,
        isMutation: operation.operation === "mutation",
        operationName: operation.name?.value ?? null,
    };
}

/**
 * Runs a planned request against a document.
 *
 * Returns the next document only when a mutation actually changed something, so
 * a mutation that 404s — `deletePost(id: "nope")` — costs a lock and writes
 * nothing, exactly as the REST studio's equivalent does.
 */
export function executeRequest(
    plan: Extract<RequestPlan, { ok: true }>,
    request: GraphqlRequest,
    document: JsonDocument,
    storedBytes: number,
): GraphqlOutcome {
    if (plan.isMutation && !request.allowMutation) {
        return refuse(
            405,
            "mutation_over_get",
            "Mutations must be sent as POST. The GraphQL-over-HTTP specification reserves GET for safe, idempotent requests, and honouring that is what stops a link from writing to this fixture.",
            plan.operationName,
        );
    }

    const model = buildSchemaModel(document);
    const schema = buildSchema(model);
    const errors = validate(schema, plan.ast, specifiedRules);

    if (errors.length > 0) {
        return failure(400, "validation_failed", errors, plan.operationName);
    }

    const verdict = analyzeOperation(plan.ast, plan.operation, request.variables);

    if (!verdict.ok) {
        return refuse(
            400,
            verdict.reason,
            guardMessage(verdict.reason, verdict.analysis),
            plan.operationName,
            verdict.analysis,
        );
    }

    const state: ExecutionState = {
        document,
        mutated: false,
        // Read from the stored column rather than measured, so guarding a write
        // costs a number rather than a serialisation of the megabyte it guards.
        full: storedBytes >= MAX_DOCUMENT_BYTES,
    };

    const result = runGraphql({
        schema,
        document: plan.ast,
        contextValue: state,
        variableValues: request.variables ?? undefined,
        operationName: request.operationName ?? undefined,
    });

    // `execute` returns a promise only when a resolver does, and none of ours is
    // async — every one reads from an object already in memory. Narrowing here
    // rather than awaiting keeps this whole engine synchronous and therefore
    // testable without a runtime.
    if (isPromise(result)) {
        throw new TypeError(
            "A resolver returned a promise. Every resolver in this schema is synchronous.",
        );
    }

    const body = JSON.stringify({
        ...(result.data === undefined ? {} : { data: result.data }),
        ...(result.errors === undefined ? {} : { errors: result.errors.map(describeError) }),
    });

    if (!state.mutated) {
        return {
            status: 200,
            body,
            document: null,
            bytes: 0,
            cost: verdict.analysis.cost,
            depth: verdict.analysis.depth,
            operationName: plan.operationName,
        };
    }

    return {
        status: 200,
        body,
        document: state.document,
        // Measured through the same writer the studio's usage bar reads, so the
        // number stored and the number shown cannot disagree.
        bytes: getByteLength(writeDocument(state.document)),
        cost: verdict.analysis.cost,
        depth: verdict.analysis.depth,
        operationName: plan.operationName,
    };
}

/**
 * A refusal that never reached execution.
 *
 * Shaped like a GraphQL response — `{ errors: [...] }` — rather than like this
 * site's REST refusals, because a GraphQL client parses the body it gets and a
 * bespoke error envelope is one its error handler cannot see. The extra
 * `extensions.code` is the conventional place clients look for a machine-readable
 * reason, so a caller can branch on `TOO_COSTLY` without reading English.
 */
export function refuse(
    status: number,
    reason: GraphqlError,
    message: string,
    operationName: string | null,
    analysis?: Analysis,
): GraphqlOutcome {
    return {
        status,
        body: JSON.stringify({
            errors: [{ message, extensions: { code: reason.toUpperCase() } }],
        }),
        document: null,
        bytes: 0,
        cost: analysis?.cost ?? 0,
        depth: analysis?.depth ?? 0,
        operationName,
    };
}

function failure(
    status: number,
    reason: GraphqlError,
    errors: readonly GraphQLError[],
    operationName: string | null,
): GraphqlOutcome {
    return {
        status,
        body: JSON.stringify({
            errors: errors.map((error) => ({
                ...describeError(error),
                extensions: { ...error.extensions, code: reason.toUpperCase() },
            })),
        }),
        document: null,
        bytes: 0,
        cost: 0,
        depth: 0,
        operationName,
    };
}

/**
 * One error, reduced to what a client can act on.
 *
 * The message, where in the query it was, and which field it was under. **Never
 * `originalError`**, which for a resolver failure is a JavaScript `Error` whose
 * stack names this server's file paths — and which `graphql-js` will happily
 * serialise if the whole object is handed to `JSON.stringify`.
 */
function describeError(error: GraphQLError): Record<string, unknown> {
    return {
        message: error.message,
        ...(error.locations === undefined ? {} : { locations: error.locations }),
        ...(error.path === undefined ? {} : { path: error.path }),
        ...(error.extensions === undefined || Object.keys(error.extensions).length === 0
            ? {}
            : { extensions: error.extensions }),
    };
}

function guardMessage(
    reason: "too_deep" | "too_costly" | "too_many_root_fields",
    analysis: Analysis,
): string {
    switch (reason) {
        case "too_deep":
            return `The query nests ${analysis.depth} levels deep. Relations here are cyclic — a post has comments and every comment has a post — so there is a ceiling on how far a selection may follow them.`;
        case "too_costly":
            return `This query could return around ${analysis.cost} nodes. Narrow it with a smaller \`perPage\`, a \`where\` filter, or fewer nested relations.`;
        default:
            return `The operation asks for ${analysis.rootFields} root fields. Aliasing one field many times multiplies the work without changing the shape of the answer.`;
    }
}

function isPromise(value: unknown): value is Promise<unknown> {
    return typeof (value as { then?: unknown } | null)?.then === "function";
}
