import type { RegexDiagnostic, RegexNode } from "../types";

/**
 * Two checks the engine cannot make on your behalf.
 *
 * The first catches PCRE syntax that ECMAScript has no equivalent for. Those
 * patterns do fail to compile, but with messages like "Invalid group" pointing
 * at nothing in particular; naming the construct and its position is far more
 * use than passing that through.
 *
 * The second is advisory: nested unbounded quantifiers are the shape behind
 * almost every catastrophic-backtracking incident, and the warning is the only
 * thing standing between a curious pattern and a wedged tab.
 */

/** Constructs with no ECMAScript equivalent, flagged before compiling. */
const UNSUPPORTED_KINDS = new Set<RegexNode["kind"]>(["atomicGroup", "recursion"]);

function isVariableLength(node: RegexNode): boolean {
    const quantifier = node.quantifier;

    return quantifier !== undefined && (quantifier.max === null || quantifier.max > 1);
}

function containsVariableQuantifier(node: RegexNode): boolean {
    for (const child of node.children ?? []) {
        if (isVariableLength(child) || containsVariableQuantifier(child)) {
            return true;
        }
    }

    return false;
}

function collect(pattern: string, node: RegexNode, diagnostics: RegexDiagnostic[]): void {
    const source = pattern.slice(node.start, node.end);

    if (UNSUPPORTED_KINDS.has(node.kind)) {
        diagnostics.push({
            code: "unsupportedConstruct",
            severity: "error",
            start: node.start,
            end: node.end,
            source,
        });
    }

    // `(?#…)` is a comment group; the bare `#…` form only exists under `x`, and
    // that one the compiler never sees.
    if (node.kind === "comment" && node.openLength !== undefined) {
        diagnostics.push({
            code: "unsupportedConstruct",
            severity: "error",
            start: node.start,
            end: node.end,
            source,
        });
    }

    // `(?i)` switches a flag on mid-pattern. Only the `(?i:…)` form has an
    // ECMAScript counterpart, and that one carries a body.
    if (node.kind === "modifierGroup" && (node.children ?? []).length === 0) {
        diagnostics.push({
            code: "unsupportedConstruct",
            severity: "error",
            start: node.start,
            end: node.end,
            source,
        });
    }

    const quantifier = node.quantifier;

    if (quantifier?.possessive === true) {
        diagnostics.push({
            code: "unsupportedConstruct",
            severity: "error",
            start: quantifier.start,
            end: quantifier.end,
            source: pattern.slice(quantifier.start, quantifier.end),
        });
    }

    if (isVariableLength(node) && containsVariableQuantifier(node)) {
        diagnostics.push({
            code: "nestedQuantifier",
            severity: "warning",
            start: node.start,
            end: quantifier === undefined ? node.end : quantifier.end,
            source: pattern.slice(node.start, quantifier?.end ?? node.end),
        });
    }

    for (const child of node.children ?? []) {
        collect(pattern, child, diagnostics);
    }
}

export function lintPattern(pattern: string, root: RegexNode): readonly RegexDiagnostic[] {
    const diagnostics: RegexDiagnostic[] = [];
    collect(pattern, root, diagnostics);

    return diagnostics.toSorted((a, b) => a.start - b.start);
}
