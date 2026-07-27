"use client";

import "katex/dist/katex.min.css";

import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { RefObject, UIEvent } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { MarkdownDocument } from "../types";
import { MarkdownNodes } from "./markdown-nodes";

type PreviewPanelProps = {
    parsed: MarkdownDocument | null;
    /** Already-localised failure message, or `null` when the source parsed. */
    error: string | null;
    /** True while the debounced source has yet to reach the parser. */
    pending: boolean;
    labelId: string;
    /** The scrolling box, which the editor pane is kept level with. */
    scrollRef: RefObject<HTMLDivElement | null>;
    /** The rendered document itself, which the HTML export serialises. */
    contentRef: RefObject<HTMLDivElement | null>;
    onScroll: (event: UIEvent<HTMLDivElement>) => void;
    /** Stretches to whatever height the parent gives it, for the full-screen overlay. */
    fill?: boolean;
};

export function PreviewPanel({
    parsed,
    error,
    pending,
    labelId,
    scrollRef,
    contentRef,
    onScroll,
    fill = false,
}: PreviewPanelProps) {
    const t = useTranslations("markdown.workbench");
    const empty = parsed !== null && parsed.blocks.length === 0;

    return (
        // Matches the editor pane: from `lg` up both sections fill the grid row,
        // so the preview box grows to cover the height the editor spends on its
        // toolbar and the two boxes end level.
        <section
            className={cn("flex min-w-0 flex-col gap-2", fill ? "h-full min-h-0" : "lg:h-full")}
        >
            <Label id={labelId} className="text-muted-foreground text-xs">
                {t("previewLabel")}
            </Label>

            {error !== null ? (
                <p
                    role="alert"
                    className={cn(
                        "text-destructive ring-destructive/30 bg-destructive/8 flex min-h-0 items-start gap-2.5 rounded-xl p-4 text-[0.8125rem] leading-6 ring-1 ring-inset",
                        fill ? "h-full flex-1" : "h-96 lg:h-auto lg:flex-1",
                    )}
                >
                    <IconAlertTriangle
                        className="mt-0.5 size-4 shrink-0"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                    {error}
                </p>
            ) : (
                <div
                    // A scrollable region has to be reachable from the keyboard,
                    // which is what the tabIndex is for.
                    role="region"
                    aria-labelledby={labelId}
                    tabIndex={0}
                    ref={scrollRef}
                    onScroll={onScroll}
                    className={cn(
                        "bg-card/70 ring-border/60 min-h-0 overflow-auto rounded-xl px-5 py-4 ring-1 ring-inset",
                        fill ? "h-full flex-1" : "h-96 lg:h-auto lg:flex-1",
                        "focus-visible:ring-ring focus-visible:ring-2",
                        // Dimmed rather than emptied while the debounce settles,
                        // so the pane never flashes between two valid renders.
                        "transition-opacity duration-200",
                        pending && "opacity-55",
                    )}
                >
                    {/* Marked for the print stylesheet, which drops every other
                        element on the page when this pane is sent to a printer. */}
                    <div ref={contentRef} className="print-region text-[0.9375rem]">
                        {empty ? (
                            <p className="text-muted-foreground text-[0.8125rem] leading-6">
                                {t("previewPlaceholder")}
                            </p>
                        ) : (
                            parsed !== null && <MarkdownNodes blocks={parsed.blocks} />
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
