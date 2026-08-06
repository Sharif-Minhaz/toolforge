import type {
    ArgumentNode,
    DocumentNode,
    FragmentDefinitionNode,
    OperationDefinitionNode,
    SelectionSetNode,
    ValueNode,
} from "graphql";

import {
    DEFAULT_PER_PAGE,
    MAX_ANALYSIS_NODES,
    MAX_PER_PAGE,
    MAX_QUERY_COST,
    MAX_QUERY_DEPTH,
    MAX_ROOT_FIELDS,
} from "./constants";

/**
 * What a GraphQL request is allowed to cost, decided from the query alone.
 *
 * ---
 *
 * **This file and `execute.ts` are the only two in this module that import
 * `graphql`, and neither may ever be imported by a client component.** The rest
 * of `domain/` is plain data precisely so the studio can render a schema without
 * shipping the reference implementation to a browser. Reaching for `execute` or
 * `guard` from a component is how that stops being true.
 *
 * ---
 *
 * GraphQL moves the cost of a request from the server's route table to the
 * caller's query, and that is the whole security difference from the REST
 * studio. `GET /posts` can only ever return one collection. A single GraphQL
 * document can ask for every collection, joined to itself, many times over, in
 * two hundred bytes — and the derived relation fields are **cyclic by
 * construction**, since a `Post` has `comments` and every `Comment` has a
 * `post`. Without a bound, one visitor's runaway `useEffect` is an outage and
 * one curious stranger is a bill.
 *
 * Three bounds, because each catches a shape the other two do not:
 *
 * - **Depth** stops the cycle. Nothing else does: `post { comments { post { … } } }`
 *   is one root field and one small page size at every level.
 * - **Cost** stops breadth. `posts(perPage: 1000) { comments(perPage: 1000) { … } }`
 *   is three levels deep and a million records.
 * - **Root-field count** stops aliasing. `a: posts b: posts c: posts …` adds no
 *   depth and multiplies work, and is the one shape the other two miss entirely.
 *
 * All three are computed **before a single resolver runs**, which is the only
 * ordering that helps — the point is to refuse the work, not to measure it
 * afterwards. And all three are read from the query document, never from the
 * stored data, so the analysis costs nothing that scales with the fixture.
 */

export type Analysis = {
    readonly depth: number;
    /** An upper bound on the response's node count, from the query alone. */
    readonly cost: number;
    readonly rootFields: number;
};

export type GuardVerdict =
    | { readonly ok: true; readonly analysis: Analysis }
    | {
          readonly ok: false;
          readonly reason: "too_deep" | "too_costly" | "too_many_root_fields";
          readonly analysis: Analysis;
      };

/**
 * Introspection is exempt from both the depth and the cost bound.
 *
 * Not an oversight and not a hole. `__schema` and `__type` walk the *schema*,
 * which is derived from a document already capped at a megabyte, so their cost
 * is bounded by something this server controls rather than by anything the
 * caller writes. Charging them the same per-level multiplier as a data field
 * would refuse the standard introspection query outright — GraphiQL's is around
 * nine levels deep — and an endpoint whose schema cannot be introspected is one
 * no IDE, no codegen tool and no `apollo client:download-schema` can use, which
 * is most of what makes a hosted GraphQL fixture worth having.
 */
function isIntrospection(name: string): boolean {
    return name.startsWith("__");
}

export function analyzeOperation(
    document: DocumentNode,
    operation: OperationDefinitionNode,
    variables: Readonly<Record<string, unknown>> | null,
): GuardVerdict {
    const fragments = new Map<string, FragmentDefinitionNode>();

    for (const definition of document.definitions) {
        if (definition.kind === "FragmentDefinition") {
            fragments.set(definition.name.value, definition);
        }
    }

    const state: Mutable = { depth: 0, cost: 0, visits: 0 };

    walk(operation.selectionSet, 1, 1, fragments, variables, state);

    const analysis: Analysis = {
        depth: state.depth,
        cost: state.cost,
        rootFields: countRootFields(operation.selectionSet, fragments),
    };

    if (analysis.rootFields > MAX_ROOT_FIELDS) {
        return { ok: false, reason: "too_many_root_fields", analysis };
    }

    // Depth is checked before cost because a document that trips both is almost
    // always a runaway cycle, and "this nests too far" points at the fix while
    // "this could return a lot of nodes" sends somebody looking at page sizes.
    if (analysis.depth > MAX_QUERY_DEPTH) {
        return { ok: false, reason: "too_deep", analysis };
    }

    return analysis.cost > MAX_QUERY_COST || state.visits > MAX_ANALYSIS_NODES
        ? { ok: false, reason: "too_costly", analysis }
        : { ok: true, analysis };
}

type Mutable = { depth: number; cost: number; visits: number };

/**
 * One pass that measures both depth and cost.
 *
 * `nodes` is how many objects this level could be evaluated against — the
 * running product of every page size above it. A field with a sub-selection
 * multiplies it by that field's page size; a leaf field simply costs one per
 * object it appears on. So `posts(perPage: 10) { id title }` is 10 + 10 + 10,
 * and every extra level of relation multiplies rather than adds, which is
 * exactly the growth the budget exists to catch.
 *
 * Fragment spreads are followed. That is safe here **only because
 * `specifiedRules` has already run and rejected cyclic fragments** — see
 * `execute.ts`, where validation is a separate, earlier step for this reason. A
 * walker that followed spreads before that check would not terminate on a
 * fragment that spreads itself, which is a document anybody can send.
 */
function walk(
    selectionSet: SelectionSetNode,
    depth: number,
    nodes: number,
    fragments: ReadonlyMap<string, FragmentDefinitionNode>,
    variables: Readonly<Record<string, unknown>> | null,
    state: Mutable,
): void {
    if (depth > state.depth) {
        state.depth = depth;
    }

    /**
     * Two stopping conditions, and they are deliberately not one.
     *
     * **Depth** stops the recursion once the answer cannot change — anything
     * below the ceiling is already a refusal.
     *
     * **The visit budget** stops fragment expansion, which adds no depth and no
     * estimated cost but multiplies this walk exponentially. It is checked here
     * rather than turned into an early `return` on cost, and that distinction
     * cost a real bug: bailing on cost meant `state.depth` stopped being updated
     * the moment the estimate blew, so a twelve-level cycle reported a depth of
     * six and came back as "too costly" — true, but pointing at the wrong fix.
     */
    if (depth > MAX_QUERY_DEPTH || state.visits > MAX_ANALYSIS_NODES) {
        return;
    }

    for (const selection of selectionSet.selections) {
        state.visits += 1;

        if (selection.kind === "FragmentSpread") {
            const fragment = fragments.get(selection.name.value);

            if (fragment !== undefined) {
                // A spread is not a level of its own — it is textual reuse — so
                // the depth is passed through unchanged.
                walk(fragment.selectionSet, depth, nodes, fragments, variables, state);
            }

            continue;
        }

        if (selection.kind === "InlineFragment") {
            walk(selection.selectionSet, depth, nodes, fragments, variables, state);

            continue;
        }

        if (isIntrospection(selection.name.value)) {
            state.cost += 1;

            continue;
        }

        if (selection.selectionSet === undefined) {
            state.cost += nodes;

            continue;
        }

        const reached = nodes * pageSizeOf(selection.arguments, variables);

        state.cost += reached;
        walk(selection.selectionSet, depth + 1, reached, fragments, variables, state);
    }
}

/**
 * The page size a field could return.
 *
 * Read from the `perPage` argument when it is there, whether written as a
 * literal or passed as a variable — a bound that a variable could slip past
 * would be no bound at all, since every real client sends variables. Absent, the
 * schema's own default applies, which is why that default is load-bearing rather
 * than cosmetic: without one, every list would have to be assumed at
 * `MAX_PER_PAGE` and ordinary two-level queries would be refused.
 */
function pageSizeOf(
    args: readonly ArgumentNode[] | undefined,
    variables: Readonly<Record<string, unknown>> | null,
): number {
    for (const argument of args ?? []) {
        if (argument.name.value !== "perPage") {
            continue;
        }

        const value = readIntValue(argument.value, variables);

        if (value === null) {
            break;
        }

        return Math.min(MAX_PER_PAGE, Math.max(1, value));
    }

    return DEFAULT_PER_PAGE;
}

function readIntValue(
    node: ValueNode,
    variables: Readonly<Record<string, unknown>> | null,
): number | null {
    if (node.kind === "IntValue") {
        const parsed = Number.parseInt(node.value, 10);

        return Number.isFinite(parsed) ? parsed : null;
    }

    if (node.kind === "Variable") {
        const supplied = variables?.[node.name.value];

        return typeof supplied === "number" && Number.isFinite(supplied) ? supplied : null;
    }

    return null;
}

/**
 * Root fields, counting aliases separately.
 *
 * Separately is the whole point: `a: posts` and `b: posts` are two executions of
 * the same resolver, and a document with two hundred of them is two hundred full
 * scans from one small request. Fragments at the root are expanded, because
 * spreading a fragment of forty root fields is the same request written more
 * politely.
 */
function countRootFields(
    selectionSet: SelectionSetNode,
    fragments: ReadonlyMap<string, FragmentDefinitionNode>,
): number {
    let total = 0;

    for (const selection of selectionSet.selections) {
        if (selection.kind === "Field") {
            total += 1;

            continue;
        }

        if (selection.kind === "InlineFragment") {
            total += countRootFields(selection.selectionSet, fragments);

            continue;
        }

        const fragment = fragments.get(selection.name.value);

        if (fragment !== undefined) {
            total += countRootFields(fragment.selectionSet, fragments);
        }
    }

    return total;
}
