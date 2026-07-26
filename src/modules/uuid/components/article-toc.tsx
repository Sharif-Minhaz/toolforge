"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type TocItem = {
    readonly id: string;
    readonly label: string;
};

type ArticleTocProps = {
    title: string;
    items: readonly TocItem[];
};

/** Sticky table of contents that tracks the section currently in view. */
export function ArticleToc({ title, items }: ArticleTocProps) {
    const [activeId, setActiveId] = useState(items[0]?.id ?? "");

    useEffect(() => {
        const sections = items
            .map((item) => document.getElementById(item.id))
            .filter((element): element is HTMLElement => element !== null);

        if (sections.length === 0) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

                if (visible.length > 0) {
                    setActiveId(visible[0].target.id);
                }
            },
            // Focus on the upper third of the viewport so the highlight moves
            // roughly when the reader's eye does.
            { rootMargin: "-88px 0px -66% 0px", threshold: 0 },
        );

        for (const section of sections) {
            observer.observe(section);
        }

        return () => observer.disconnect();
    }, [items]);

    return (
        <nav
            aria-label={title}
            className="bg-card/70 ring-border/70 rounded-xl p-3 ring-1 ring-inset xl:sticky xl:top-8 xl:bg-transparent xl:p-0 xl:ring-0"
        >
            <p className="text-muted-foreground/85 px-2 pb-2 text-[0.6875rem] font-semibold tracking-[0.09em] uppercase">
                {title}
            </p>
            <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                    const active = item.id === activeId;

                    return (
                        <li key={item.id} className="relative">
                            {active && (
                                <motion.span
                                    layoutId="toc-indicator"
                                    transition={{ type: "spring", stiffness: 460, damping: 38 }}
                                    className="bg-primary absolute inset-y-0 left-0 w-0.75 rounded-full"
                                />
                            )}
                            <a
                                href={`#${item.id}`}
                                aria-current={active ? "location" : undefined}
                                className={cn(
                                    "block rounded-md py-1.5 pr-2 pl-3 text-[0.8125rem] leading-snug transition-colors duration-200",
                                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                    active
                                        ? "text-foreground font-medium"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {item.label}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
