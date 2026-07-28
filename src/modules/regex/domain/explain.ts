import {
    CONTROL_ESCAPE_NAMES,
    type ControlEscapeName,
    type ExplanationDetail,
    type ExplanationNode,
    type Greediness,
    type RegexNode,
    type RegexQuantifier,
} from "../types";

/**
 * Turns the parse tree into the lines the Explanation panel renders.
 *
 * Every line carries a discriminated `detail` rather than a message string:
 * translating belongs to the UI, and a union is what keeps each branch checked
 * against the arguments its message actually declares.
 */

export type ExplainContext = {
    /** `^` and `$` mean line boundaries under `m`, string boundaries without. */
    readonly multiline: boolean;
    /** `.` reaches line terminators under `s`. */
    readonly dotAll: boolean;
};

const CONTROL_LETTER = "control";

function isControlEscapeName(value: string): value is ControlEscapeName {
    return (CONTROL_ESCAPE_NAMES as readonly string[]).includes(value);
}

function codePointOf(value: string | undefined): number {
    return value === undefined || value.length === 0 ? 0 : (value.codePointAt(0) ?? 0);
}

function greedinessOf(quantifier: RegexQuantifier): Greediness {
    if (quantifier.possessive) {
        return "possessive";
    }

    return quantifier.greedy ? "greedy" : "lazy";
}

function quantifierDetail(quantifier: RegexQuantifier): ExplanationDetail {
    const { min, max } = quantifier;

    if (min === 0 && max === 1) {
        return { kind: "quantifierOptional" };
    }

    if (min === 0 && max === null) {
        return { kind: "quantifierZeroOrMore" };
    }

    if (min === 1 && max === null) {
        return { kind: "quantifierOneOrMore" };
    }

    if (max === null) {
        return { kind: "quantifierAtLeast", min };
    }

    if (min === max) {
        return { kind: "quantifierExactly", count: min };
    }

    return { kind: "quantifierBetween", min, max };
}

function shorthandDetail(letter: string, negated: boolean): ExplanationDetail {
    if (letter === "d") {
        return { kind: negated ? "shorthandNonDigit" : "shorthandDigit" };
    }

    if (letter === "s") {
        return { kind: negated ? "shorthandNonSpace" : "shorthandSpace" };
    }

    return { kind: negated ? "shorthandNonWord" : "shorthandWord" };
}

function literalDetail(value: string): ExplanationDetail {
    return [...value].length === 1
        ? { kind: "literalChar", char: value, code: codePointOf(value) }
        : { kind: "literalText", text: value };
}

function detailOf(node: RegexNode, context: ExplainContext): ExplanationDetail | null {
    switch (node.kind) {
        case "anchorStart":
            return { kind: context.multiline ? "anchorStartLine" : "anchorStartString" };
        case "anchorEnd":
            return { kind: context.multiline ? "anchorEndLine" : "anchorEndString" };
        case "wordBoundary":
            return { kind: node.negated === true ? "nonWordBoundary" : "wordBoundary" };
        case "dot":
            return { kind: context.dotAll ? "dotAll" : "dot" };
        case "literal":
            return literalDetail(node.value ?? "");
        case "escapedLiteral":
            return { kind: "literalChar", char: node.value ?? "", code: codePointOf(node.value) };
        case "shorthand":
            return shorthandDetail(node.detail ?? "w", node.negated === true);
        case "unicodeProperty":
            return node.negated === true
                ? { kind: "unicodePropertyNegated", property: node.detail ?? "" }
                : { kind: "unicodeProperty", property: node.detail ?? "" };
        case "controlEscape": {
            if (node.detail === CONTROL_LETTER) {
                return { kind: "controlLetter", letter: node.value ?? "" };
            }

            const name = node.detail ?? "";

            return isControlEscapeName(name)
                ? { kind: "controlEscape", name, code: codePointOf(node.value) }
                : { kind: "unknown" };
        }
        case "hexEscape":
        case "unicodeEscape":
            return {
                kind: "codePointEscape",
                char: node.value ?? "",
                code: codePointOf(node.value),
            };
        case "characterClass":
            return { kind: node.negated === true ? "characterClassNegated" : "characterClass" };
        case "classRange": {
            const [lower, upper] = node.children ?? [];

            return {
                kind: "classRange",
                from: lower?.value ?? "",
                to: upper?.value ?? "",
            };
        }
        case "backreference":
            return { kind: "backreference", index: Number(node.detail ?? "0") };
        case "namedBackreference":
            return { kind: "namedBackreference", name: node.detail ?? "" };
        case "captureGroup":
            return { kind: "captureGroup", index: node.groupIndex ?? 0 };
        case "namedGroup":
            return {
                kind: "namedGroup",
                index: node.groupIndex ?? 0,
                name: node.groupName ?? "",
            };
        case "nonCapturingGroup":
            return { kind: "nonCapturingGroup" };
        case "lookahead":
            return { kind: node.negated === true ? "negativeLookahead" : "lookahead" };
        case "lookbehind":
            return { kind: node.negated === true ? "negativeLookbehind" : "lookbehind" };
        case "atomicGroup":
            return { kind: "atomicGroup" };
        case "modifierGroup":
            return { kind: "modifierGroup", modifiers: node.detail ?? "" };
        case "recursion":
            return { kind: "recursion" };
        case "comment":
            return { kind: "comment" };
        case "alternation":
            return { kind: "alternation", count: (node.children ?? []).length };
        // Whitespace under `x` carries no meaning, so it earns no line.
        case "ignorableWhitespace":
        case "sequence":
            return null;
        default:
            return { kind: "unknown" };
    }
}

function explainQuantifier(
    pattern: string,
    quantifier: RegexQuantifier,
    path: string,
): ExplanationNode {
    return {
        id: `${path}q`,
        detail: quantifierDetail(quantifier),
        source: pattern.slice(quantifier.start, quantifier.end),
        greediness: greedinessOf(quantifier),
        children: [],
    };
}

function explainNodes(
    pattern: string,
    nodes: readonly RegexNode[],
    path: string,
    context: ExplainContext,
): ExplanationNode[] {
    const lines: ExplanationNode[] = [];

    for (const [index, child] of nodes.entries()) {
        // A sequence is a grouping artefact, not something to explain; its
        // children belong to whatever contains it.
        if (child.kind === "sequence" && child.quantifier === undefined) {
            lines.push(...explainNodes(pattern, child.children ?? [], `${path}${index}.`, context));
            continue;
        }

        const line = explainNode(pattern, child, `${path}${index}.`, context);

        if (line !== null) {
            lines.push(line);
        }
    }

    return lines;
}

function explainNode(
    pattern: string,
    node: RegexNode,
    path: string,
    context: ExplainContext,
): ExplanationNode | null {
    const detail = detailOf(node, context);

    if (detail === null) {
        return null;
    }

    const children: ExplanationNode[] = [];

    // The quantifier reads as the first thing under its target, which is how
    // "one or more times" ends up directly beneath the token it repeats.
    if (node.quantifier !== undefined) {
        children.push(explainQuantifier(pattern, node.quantifier, path));
    }

    if (node.kind === "alternation") {
        for (const [index, branch] of (node.children ?? []).entries()) {
            children.push({
                id: `${path}${index}b`,
                detail: { kind: "alternationBranch", index: index + 1 },
                source: pattern.slice(branch.start, branch.end),
                children: explainNodes(pattern, [branch], `${path}${index}b.`, context),
            });
        }
    } else {
        children.push(...explainNodes(pattern, node.children ?? [], path, context));
    }

    return {
        id: path,
        detail,
        source: pattern.slice(node.start, node.end),
        children,
    };
}

export function toExplanation(
    pattern: string,
    root: RegexNode,
    context: ExplainContext,
): readonly ExplanationNode[] {
    return explainNodes(pattern, [root], "", context);
}
