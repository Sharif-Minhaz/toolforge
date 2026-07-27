"use client";

import {
    IconAlertTriangle,
    IconBulb,
    IconFlame,
    IconInfoCircle,
    IconMessageReport,
    type IconProps,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";
import type {
    MarkdownAlertKind,
    MarkdownAlign,
    MarkdownBlock,
    MarkdownHeadingDepth,
    MarkdownInline,
    MarkdownTableCell,
} from "../types";
import { MathFormula } from "./math-formula";
import { MermaidDiagram } from "./mermaid-diagram";

/**
 * Nodes to React elements. Nothing here reaches for `dangerouslySetInnerHTML`
 * except the two components that own trusted markup — KaTeX and Mermaid — so
 * every string the author typed is escaped by React on the way out.
 */

/* ----------------------------------------------------------------- inline --- */

function InlineNodes({ nodes }: { nodes: readonly MarkdownInline[] }) {
    return nodes.map((node, index) => <InlineNode key={index} node={node} />);
}

function InlineNode({ node }: { node: MarkdownInline }) {
    switch (node.kind) {
        case "text":
            return node.value;
        case "strong":
            return (
                <strong className="font-semibold">
                    <InlineNodes nodes={node.children} />
                </strong>
            );
        case "emphasis":
            return (
                <em className="italic">
                    <InlineNodes nodes={node.children} />
                </em>
            );
        case "strikethrough":
            return (
                <del className="text-muted-foreground line-through">
                    <InlineNodes nodes={node.children} />
                </del>
            );
        case "code":
            return (
                <code className="bg-muted ring-border/60 rounded-md px-1.5 py-0.5 font-mono text-[0.85em] ring-1 ring-inset">
                    {node.value}
                </code>
            );
        case "break":
            return <br />;
        case "math":
            return <MathFormula tex={node.tex} display={node.display} />;
        case "image":
            return <PreviewImage src={node.src} alt={node.alt} title={node.title} />;
        case "link":
            return (
                <a
                    href={node.href}
                    title={node.title ?? undefined}
                    // Author content pointing anywhere; `noreferrer` keeps the
                    // opener and the referrer out of a third party's hands.
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-primary decoration-primary/40 hover:decoration-primary focus-visible:ring-ring rounded-sm underline underline-offset-2 transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                >
                    <InlineNodes nodes={node.children} />
                </a>
            );
    }
}

type PreviewImageProps = {
    src: string;
    alt: string;
    title: string | null;
};

/**
 * A plain `<img>`, deliberately.
 *
 * The source is whatever the author typed, so its dimensions are unknowable
 * ahead of time and there is no origin to allowlist — the two things
 * `next/image` needs. Loading is lazy and the box is capped at the column
 * width, which is the part of the optimisation that actually applies here.
 */
function PreviewImage({ src, alt, title }: PreviewImageProps) {
    return (
        <img
            src={src}
            alt={alt}
            title={title ?? undefined}
            loading="lazy"
            decoding="async"
            className="ring-border/60 my-1 inline-block h-auto max-w-full rounded-lg ring-1 ring-inset"
        />
    );
}

/* ------------------------------------------------------------------ alert --- */

const ALERT_ICONS: Record<MarkdownAlertKind, ComponentType<IconProps>> = {
    note: IconInfoCircle,
    tip: IconBulb,
    important: IconMessageReport,
    warning: IconAlertTriangle,
    caution: IconFlame,
};

/** One brand hue per flavour, so both themes are already defined for it. */
const ALERT_ACCENTS: Record<MarkdownAlertKind, string> = {
    note: "[--tool-accent:var(--brand-cyan)]",
    tip: "[--tool-accent:var(--brand-emerald)]",
    important: "[--tool-accent:var(--brand-violet)]",
    warning: "[--tool-accent:var(--brand-amber)]",
    caution: "[--tool-accent:var(--brand-rose)]",
};

function Alert({ kind, children }: { kind: MarkdownAlertKind; children: ReactNode }) {
    const t = useTranslations("markdown.alerts");
    const Icon = ALERT_ICONS[kind];

    return (
        <div
            className={cn(
                "my-5 rounded-xl p-4 ring-1 ring-inset",
                "bg-[color-mix(in_oklch,var(--tool-accent)_8%,transparent)] ring-[color-mix(in_oklch,var(--tool-accent)_24%,transparent)]",
                ALERT_ACCENTS[kind],
            )}
        >
            <p className="flex items-center gap-2 text-[0.8125rem] leading-[1.3] font-semibold text-[var(--tool-accent)]">
                <Icon className="size-4 shrink-0" stroke={1.9} aria-hidden="true" />
                {t(kind)}
            </p>
            <div className="mt-1.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</div>
        </div>
    );
}

/* ------------------------------------------------------------------ table --- */

const CELL_ALIGN: Record<Exclude<MarkdownAlign, null>, string> = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
};

function cellClass(align: MarkdownAlign): string {
    return align === null ? "text-left" : CELL_ALIGN[align];
}

function TableCells({ cells, header }: { cells: readonly MarkdownTableCell[]; header: boolean }) {
    return cells.map((cell, index) =>
        header ? (
            <th
                key={index}
                scope="col"
                className={cn("px-4 py-2.5 font-medium", cellClass(cell.align))}
            >
                <InlineNodes nodes={cell.children} />
            </th>
        ) : (
            <td key={index} className={cn("px-4 py-2.5 align-top", cellClass(cell.align))}>
                <InlineNodes nodes={cell.children} />
            </td>
        ),
    );
}

/* ------------------------------------------------------------------ block --- */

const HEADING_CLASS: Record<MarkdownHeadingDepth, string> = {
    1: "mt-8 mb-4 text-[1.75rem] font-semibold tracking-tight sm:text-3xl",
    2: "border-border/70 mt-8 mb-4 border-b pb-2 text-[1.375rem] font-semibold tracking-tight sm:text-2xl",
    3: "mt-7 mb-3 text-lg font-semibold tracking-tight sm:text-xl",
    4: "mt-6 mb-2.5 text-base font-semibold sm:text-lg",
    5: "mt-6 mb-2 text-[0.9375rem] font-semibold",
    6: "text-muted-foreground mt-6 mb-2 text-[0.875rem] font-semibold",
};

function Heading({
    depth,
    id,
    children,
}: {
    depth: MarkdownHeadingDepth;
    id: string;
    children: ReactNode;
}) {
    const className = cn("scroll-mt-24 first:mt-0", HEADING_CLASS[depth]);
    const props = { id, className, children };

    switch (depth) {
        case 1:
            return <h1 {...props} />;
        case 2:
            return <h2 {...props} />;
        case 3:
            return <h3 {...props} />;
        case 4:
            return <h4 {...props} />;
        case 5:
            return <h5 {...props} />;
        default:
            return <h6 {...props} />;
    }
}

export function MarkdownNodes({ blocks }: { blocks: readonly MarkdownBlock[] }) {
    return blocks.map((block, index) => <BlockNode key={index} block={block} />);
}

function BlockNode({ block }: { block: MarkdownBlock }) {
    const t = useTranslations("markdown.preview");

    switch (block.kind) {
        case "heading":
            return (
                <Heading depth={block.depth} id={block.id}>
                    <InlineNodes nodes={block.children} />
                </Heading>
            );
        case "paragraph":
            return (
                <p className="my-4 leading-7 first:mt-0">
                    <InlineNodes nodes={block.children} />
                </p>
            );
        case "rule":
            return <hr className="border-border/70 my-8" />;
        case "mathBlock":
            return <MathFormula tex={block.tex} display />;
        case "diagram":
            return <MermaidDiagram source={block.source} />;
        case "code":
            return (
                <div className="bg-muted/50 ring-border/60 my-5 overflow-hidden rounded-xl ring-1 ring-inset">
                    {block.language !== null && (
                        <p className="text-muted-foreground border-border/60 border-b px-4 py-1.5 font-mono text-[0.6875rem] tracking-wide uppercase">
                            {block.language}
                        </p>
                    )}
                    <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-6">
                        <code>{block.value}</code>
                    </pre>
                </div>
            );
        case "rawHtml":
            return (
                <div className="border-border/70 my-5 rounded-xl border border-dashed p-3">
                    <p className="text-muted-foreground mb-1.5 text-[0.6875rem] leading-[1.4]">
                        {t("rawHtml")}
                    </p>
                    <pre className="text-muted-foreground overflow-x-auto font-mono text-[0.8125rem] leading-6">
                        <code>{block.value}</code>
                    </pre>
                </div>
            );
        case "blockquote": {
            const children = <MarkdownNodes blocks={block.children} />;

            return block.alert === null ? (
                <blockquote className="border-primary/40 text-muted-foreground my-5 border-l-2 pl-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    {children}
                </blockquote>
            ) : (
                <Alert kind={block.alert}>{children}</Alert>
            );
        }
        case "list": {
            const items = block.items.map((item, index) => (
                <li
                    key={index}
                    className={cn(
                        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                        block.tight && "[&>p]:my-0",
                        // A task item swaps the marker for a real checkbox.
                        item.checked !== null && "-ml-6 flex list-none items-start gap-2",
                    )}
                >
                    {item.checked !== null && (
                        <input
                            type="checkbox"
                            checked={item.checked}
                            readOnly
                            // The label is the item's own text, which follows it.
                            aria-label={t("taskItem")}
                            className="accent-primary mt-1.5 size-3.5 shrink-0"
                        />
                    )}
                    <span className="min-w-0 flex-1">
                        <MarkdownNodes blocks={item.children} />
                    </span>
                </li>
            ));

            return block.ordered ? (
                <ol
                    start={block.start}
                    className={cn(
                        "my-4 list-decimal pl-6",
                        block.tight ? "space-y-1" : "space-y-3",
                    )}
                >
                    {items}
                </ol>
            ) : (
                <ul className={cn("my-4 list-disc pl-6", block.tight ? "space-y-1" : "space-y-3")}>
                    {items}
                </ul>
            );
        }
        case "table":
            return (
                <div className="ring-border/70 my-5 overflow-x-auto rounded-xl ring-1 ring-inset">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead>
                            <tr className="bg-muted/60">
                                <TableCells cells={block.header} header />
                            </tr>
                        </thead>
                        <tbody className="divide-border/70 divide-y">
                            {block.rows.map((row, index) => (
                                <tr key={index}>
                                    <TableCells cells={row} header={false} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
    }
}
