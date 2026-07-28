"use client";

import { IconChevronRight } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { ExplanationDetail, ExplanationNode } from "../types";
import { SidePanel } from "./side-panel";

/**
 * The token-by-token reading of the pattern.
 *
 * Nesting uses `<details>` rather than an accordion component: the tree can be
 * a dozen levels deep, it needs no shared open state, and a native disclosure
 * keeps every branch in the DOM for find-in-page.
 */

type ExplanationTextProps = {
    detail: ExplanationDetail;
};

function toHex(code: number): string {
    return `0x${code.toString(16).toUpperCase().padStart(2, "0")}`;
}

/**
 * One `t()` call per variant. A shared bag of arguments would type-check and
 * then render `{count}` verbatim wherever the message declared something else;
 * a switch over the union is what keeps each message honest about its inputs.
 */
function ExplanationText({ detail }: ExplanationTextProps) {
    const t = useTranslations("regex.explain");
    const tControl = useTranslations("regex.controlEscapes");

    switch (detail.kind) {
        case "anchorStartLine":
            return t("anchorStartLine");
        case "anchorStartString":
            return t("anchorStartString");
        case "anchorEndLine":
            return t("anchorEndLine");
        case "anchorEndString":
            return t("anchorEndString");
        case "wordBoundary":
            return t("wordBoundary");
        case "nonWordBoundary":
            return t("nonWordBoundary");
        case "literalText":
            return t("literalText", { text: detail.text });
        case "literalChar":
            return t("literalChar", {
                char: detail.char,
                // A character index mirrors machine input, so it keeps Western
                // digits: passed as a string, it never reaches a number format.
                code: String(detail.code),
                hex: toHex(detail.code),
            });
        case "dot":
            return t("dot");
        case "dotAll":
            return t("dotAll");
        case "shorthandDigit":
            return t("shorthandDigit");
        case "shorthandNonDigit":
            return t("shorthandNonDigit");
        case "shorthandWord":
            return t("shorthandWord");
        case "shorthandNonWord":
            return t("shorthandNonWord");
        case "shorthandSpace":
            return t("shorthandSpace");
        case "shorthandNonSpace":
            return t("shorthandNonSpace");
        case "unicodeProperty":
            return t("unicodeProperty", { property: detail.property });
        case "unicodePropertyNegated":
            return t("unicodePropertyNegated", { property: detail.property });
        case "controlEscape":
            return t("controlEscape", {
                name: tControl(detail.name),
                code: String(detail.code),
                hex: toHex(detail.code),
            });
        case "controlLetter":
            return t("controlLetter", { letter: detail.letter });
        case "codePointEscape":
            return t("codePointEscape", {
                char: detail.char,
                code: String(detail.code),
                hex: toHex(detail.code),
            });
        case "characterClass":
            return t("characterClass");
        case "characterClassNegated":
            return t("characterClassNegated");
        case "classRange":
            return t("classRange", { from: detail.from, to: detail.to });
        case "backreference":
            return t("backreference", { index: detail.index });
        case "namedBackreference":
            return t("namedBackreference", { name: detail.name });
        case "captureGroup":
            return t("captureGroup", { index: detail.index });
        case "namedGroup":
            return t("namedGroup", { index: detail.index, name: detail.name });
        case "nonCapturingGroup":
            return t("nonCapturingGroup");
        case "lookahead":
            return t("lookahead");
        case "negativeLookahead":
            return t("negativeLookahead");
        case "lookbehind":
            return t("lookbehind");
        case "negativeLookbehind":
            return t("negativeLookbehind");
        case "atomicGroup":
            return t("atomicGroup");
        case "modifierGroup":
            return t("modifierGroup", { modifiers: detail.modifiers });
        case "recursion":
            return t("recursion");
        case "comment":
            return t("comment");
        case "alternation":
            return t("alternation", { count: detail.count });
        case "alternationBranch":
            return t("alternationBranch", { index: detail.index });
        case "quantifierOptional":
            return t("quantifierOptional");
        case "quantifierZeroOrMore":
            return t("quantifierZeroOrMore");
        case "quantifierOneOrMore":
            return t("quantifierOneOrMore");
        case "quantifierExactly":
            return t("quantifierExactly", { count: detail.count });
        case "quantifierAtLeast":
            return t("quantifierAtLeast", { min: detail.min });
        case "quantifierBetween":
            return t("quantifierBetween", { min: detail.min, max: detail.max });
        case "unknown":
            return t("unknown");
    }
}

const GREEDINESS_TONE = {
    greedy: "text-brand-cyan",
    lazy: "text-brand-amber",
    possessive: "text-brand-rose",
} as const;

type ExplanationLineProps = {
    node: ExplanationNode;
    depth: number;
};

function ExplanationLine({ node, depth }: ExplanationLineProps) {
    const t = useTranslations("regex.explain");
    const hasChildren = node.children.length > 0;

    const body = (
        <>
            <code className="bg-muted/70 text-foreground rounded px-1 py-0.5 font-mono text-[0.6875rem] break-all">
                {node.source}
            </code>{" "}
            <ExplanationText detail={node.detail} />
            {node.greediness !== undefined && (
                <span className={cn("ml-1 font-medium", GREEDINESS_TONE[node.greediness])}>
                    {t(`greediness.${node.greediness}`)}
                </span>
            )}
        </>
    );

    if (!hasChildren) {
        return (
            <li className="text-muted-foreground py-1 pl-5 text-[0.75rem] leading-[1.6]">{body}</li>
        );
    }

    return (
        <li>
            <details open={depth < 3} className="group/line">
                <summary
                    className={cn(
                        "text-muted-foreground flex cursor-pointer list-none items-start gap-1 rounded py-1 text-[0.75rem] leading-[1.6]",
                        "hover:text-foreground focus-visible:ring-ring transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none",
                        "[&::-webkit-details-marker]:hidden",
                    )}
                >
                    <IconChevronRight
                        className="mt-1 size-3.5 shrink-0 transition-transform duration-200 group-open/line:rotate-90"
                        stroke={2}
                        aria-hidden="true"
                    />
                    <span className="min-w-0">{body}</span>
                </summary>
                <ul className="border-border/60 ml-1.75 border-l pl-2">
                    {node.children.map((child) => (
                        <ExplanationLine key={child.id} node={child} depth={depth + 1} />
                    ))}
                </ul>
            </details>
        </li>
    );
}

type ExplanationPanelProps = {
    nodes: readonly ExplanationNode[];
    pending: boolean;
};

export function ExplanationPanel({ nodes, pending }: ExplanationPanelProps) {
    const t = useTranslations("regex.workbench");

    return (
        <SidePanel title={t("explanationTitle")} pending={pending}>
            {nodes.length === 0 ? (
                <p className="text-muted-foreground px-1 py-2 text-[0.75rem] leading-[1.6]">
                    {t("explanationEmpty")}
                </p>
            ) : (
                <ul className="min-w-0">
                    {nodes.map((node) => (
                        <ExplanationLine key={node.id} node={node} depth={0} />
                    ))}
                </ul>
            )}
        </SidePanel>
    );
}
