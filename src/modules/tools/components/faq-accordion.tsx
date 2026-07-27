"use client";

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export type FaqEntry = {
    readonly question: string;
    readonly answer: string;
};

type FaqAccordionProps = {
    items: readonly FaqEntry[];
    /** Entry expanded on first paint; pass `-1` to start fully collapsed. */
    defaultOpenIndex?: number;
    className?: string;
};

/**
 * Shared FAQ block for tool articles.
 *
 * `hiddenUntilFound` keeps every answer in the DOM, so find-in-page and
 * crawlers still see the copy that the panels hide.
 */
export function FaqAccordion({ items, defaultOpenIndex = 0, className }: FaqAccordionProps) {
    return (
        <Accordion
            hiddenUntilFound
            defaultValue={[defaultOpenIndex]}
            className={cn("max-w-[68ch] gap-2.5", className)}
        >
            {items.map((item, index) => (
                <AccordionItem
                    key={item.question}
                    value={index}
                    className={cn(
                        "bg-card/60 ring-border/70 rounded-xl px-4 ring-1 ring-inset not-last:border-b-0",
                        "hover:bg-card/80 transition-colors duration-200",
                    )}
                >
                    <AccordionTrigger className="gap-4 rounded-xl py-3.5 text-[0.9375rem] leading-6 font-medium hover:no-underline **:data-[slot=accordion-trigger-icon]:mt-0.5">
                        {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-4 text-[0.9375rem] leading-7">
                        {item.answer}
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
}
