import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Capped at a comfortable measure; tables and code blocks break out of it. */
export const PROSE_TEXT = "text-muted-foreground max-w-[68ch] text-[0.9375rem] leading-7";

export const PROSE = `flex flex-col gap-4 ${PROSE_TEXT}`;

/**
 * Inline code inside article prose — an algorithm name, a filename, a flag, a
 * literal value. Deliberately the same shape the Markdown preview gives inline
 * code, so `sha-256` reads identically whether an article author wrote it or a
 * pasted document produced it.
 */
export function InlineCode({ children }: { children: ReactNode }) {
    return (
        <code className="bg-muted ring-border/60 text-foreground rounded-md px-1.5 py-0.5 font-mono text-[0.85em] wrap-break-word ring-1 ring-inset">
            {children}
        </code>
    );
}

/**
 * The tag map every article hands to `t.rich`.
 *
 * Which words are code is a fact about the sentence, not about the component,
 * so it lives in the catalogue: a string carries `<code>…</code>` and both
 * locales mark up the same terms. Nothing here knows what an algorithm is
 * called, which is what keeps `en` and `bn` free to disagree about word order.
 */
export const ARTICLE_TAGS = {
    code: (chunks: ReactNode) => <InlineCode>{chunks}</InlineCode>,
};

/**
 * The same tags, thrown away, for `t.markup` — which returns a string.
 *
 * Structured data, `alt` text and metadata cannot hold an element, and they
 * must not hold a literal `<code>` either. One marked-up message in the
 * catalogue serves both: `t.rich` for the panel, `t.markup` for the JSON-LD.
 */
export const PLAIN_TAGS = {
    code: (chunks: string) => chunks,
};

/**
 * One worked example on a single line — an input, an arrow, what comes back.
 *
 * It sits between paragraphs rather than replacing one: an opening section
 * explains the idea in prose and then shows it once, because a reader who
 * skims the sentence still learns the shape of the thing from the line.
 */
export function ArticleExample({ children }: { children: ReactNode }) {
    return (
        <p className="border-primary/45 text-foreground/85 flex flex-wrap items-center gap-x-2 gap-y-2 border-l-2 py-0.5 pl-3.5 text-[0.875rem] leading-7 wrap-anywhere">
            {children}
        </p>
    );
}

type ArticleSectionProps = {
    id: string;
    title: string;
    children: ReactNode;
    className?: string;
};

/** One `id`-anchored article section, kept in step with the table of contents. */
export function ArticleSection({ id, title, children, className }: ArticleSectionProps) {
    return (
        <section id={id} className={cn("scroll-mt-24", className)}>
            <h2 className="max-w-[68ch] text-xl font-semibold tracking-tight sm:text-[1.375rem]">
                {title}
            </h2>
            <div className="mt-4">{children}</div>
        </section>
    );
}
