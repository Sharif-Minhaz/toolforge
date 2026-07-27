import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Capped at a comfortable measure; tables and code blocks break out of it. */
export const PROSE_TEXT = "text-muted-foreground max-w-[68ch] text-[0.9375rem] leading-7";

export const PROSE = `flex flex-col gap-4 ${PROSE_TEXT}`;

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
