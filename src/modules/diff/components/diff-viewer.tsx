"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { CollapsedEntry, DiffRow, DiffSegment, UnifiedLine } from "../types";

/**
 * Tints are mixed from the brand hues rather than named colours, so both themes
 * get them from the same declaration. The row tint is faint enough to read
 * through; the segment tint sits on top of it and marks the exact run.
 */
const ROW_TONE = {
    removed: "bg-[color-mix(in_oklch,var(--brand-rose)_10%,transparent)]",
    added: "bg-[color-mix(in_oklch,var(--brand-emerald)_10%,transparent)]",
} as const;

const SEGMENT_TONE = {
    removed: "rounded-[3px] bg-[color-mix(in_oklch,var(--brand-rose)_28%,transparent)]",
    added: "rounded-[3px] bg-[color-mix(in_oklch,var(--brand-emerald)_28%,transparent)]",
} as const;

const NUMBER_CELL =
    "text-muted-foreground/70 w-11 select-none px-1.5 py-0.5 text-right align-top tabular-nums";

const SIGN_CELL = "text-muted-foreground w-4 select-none py-0.5 text-center align-top";

const TEXT_CELL = "min-h-6 px-2 py-0.5 align-top break-words whitespace-pre-wrap";

/** Marks the first row of every run, so the step buttons land once per change. */
function runStarts<T>(
    entries: readonly CollapsedEntry<T>[],
    isChange: (item: T) => boolean,
): Map<number, number> {
    const starts = new Map<number, number>();
    let runs = 0;
    let inRun = false;

    entries.forEach((entry, index) => {
        if (entry.kind !== "item" || !isChange(entry.item)) {
            inRun = false;

            return;
        }

        if (!inRun) {
            starts.set(index, runs);
            runs += 1;
        }

        inRun = true;
    });

    return starts;
}

type SegmentTextProps = {
    text: string;
    segments: readonly DiffSegment[] | null;
};

function SegmentText({ text, segments }: SegmentTextProps) {
    if (segments === null) {
        return text;
    }

    return segments.map((segment, index) =>
        segment.kind === "equal" ? (
            <span key={index}>{segment.text}</span>
        ) : (
            <span key={index} className={SEGMENT_TONE[segment.kind]}>
                {segment.text}
            </span>
        ),
    );
}

type GapRowProps = {
    hidden: number;
    columns: number;
};

function GapRow({ hidden, columns }: GapRowProps) {
    const t = useTranslations("diff.workbench");

    return (
        <tr className="bg-muted/40">
            <td
                colSpan={columns}
                className="text-muted-foreground px-3 py-1 text-center text-[0.6875rem] leading-[1.4]"
            >
                {/* `#` inside an ICU plural is formatted for the locale, so the
                    count reads in Bengali numerals without a formatter here. */}
                {t("gap", { count: hidden })}
            </td>
        </tr>
    );
}

type ViewerFrameProps = {
    stale: boolean;
    scroll: boolean;
    children: ReactNode;
};

/**
 * Wide content scrolls inside its own box rather than pushing the page out —
 * only the split view is ever wider than a phone, so only it opts in.
 */
function ViewerFrame({ stale, scroll, children }: ViewerFrameProps) {
    return (
        <div
            className={cn(
                "ring-border/70 overflow-hidden rounded-xl ring-1 transition-opacity duration-200 ring-inset",
                stale && "opacity-55",
            )}
        >
            <div className={cn(scroll && "overflow-x-auto")}>{children}</div>
        </div>
    );
}

type SplitDiffViewProps = {
    entries: readonly CollapsedEntry<DiffRow>[];
    stale: boolean;
};

export function SplitDiffView({ entries, stale }: SplitDiffViewProps) {
    const t = useTranslations("diff.workbench");
    const starts = runStarts(entries, (row) => row.type !== "equal");

    return (
        <ViewerFrame stale={stale} scroll>
            <table className="w-full min-w-176 table-fixed border-collapse font-mono text-[0.8125rem] leading-6">
                <caption className="sr-only">{t("title")}</caption>
                <colgroup>
                    <col className="w-11" />
                    <col className="w-4" />
                    <col />
                    <col className="w-11" />
                    <col className="w-4" />
                    <col />
                </colgroup>
                <tbody>
                    {entries.map((entry, index) =>
                        entry.kind === "gap" ? (
                            <GapRow key={`gap-${index}`} hidden={entry.hidden} columns={6} />
                        ) : (
                            <tr
                                key={`row-${index}`}
                                data-change={starts.get(index)}
                                className="scroll-mt-24"
                            >
                                <td className={NUMBER_CELL}>{entry.item.leftNumber ?? ""}</td>
                                <td className={SIGN_CELL} aria-hidden="true">
                                    {entry.item.left !== null && entry.item.type !== "equal"
                                        ? "-"
                                        : ""}
                                </td>
                                <td
                                    className={cn(
                                        TEXT_CELL,
                                        entry.item.left !== null &&
                                            entry.item.type !== "equal" &&
                                            ROW_TONE.removed,
                                    )}
                                >
                                    {entry.item.type !== "equal" && entry.item.left !== null && (
                                        <span className="sr-only">
                                            {t(`rowTypes.${entry.item.type}`)}{" "}
                                        </span>
                                    )}
                                    {entry.item.left === null ? (
                                        <span className="sr-only">{t("noLine")}</span>
                                    ) : (
                                        <SegmentText
                                            text={entry.item.left}
                                            segments={entry.item.segments?.left ?? null}
                                        />
                                    )}
                                </td>

                                <td className={NUMBER_CELL}>{entry.item.rightNumber ?? ""}</td>
                                <td className={SIGN_CELL} aria-hidden="true">
                                    {entry.item.right !== null && entry.item.type !== "equal"
                                        ? "+"
                                        : ""}
                                </td>
                                <td
                                    className={cn(
                                        TEXT_CELL,
                                        entry.item.right !== null &&
                                            entry.item.type !== "equal" &&
                                            ROW_TONE.added,
                                    )}
                                >
                                    {entry.item.right === null ? (
                                        <span className="sr-only">{t("noLine")}</span>
                                    ) : (
                                        <SegmentText
                                            text={entry.item.right}
                                            segments={entry.item.segments?.right ?? null}
                                        />
                                    )}
                                    {entry.item.ignoredDifference && (
                                        <span
                                            title={t("ignoredMarker")}
                                            className="text-brand-amber ml-1.5 align-middle text-[0.625rem] select-none"
                                        >
                                            ≈<span className="sr-only">{t("ignoredMarker")}</span>
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ),
                    )}
                </tbody>
            </table>
        </ViewerFrame>
    );
}

type UnifiedDiffViewProps = {
    entries: readonly CollapsedEntry<UnifiedLine>[];
    stale: boolean;
};

export function UnifiedDiffView({ entries, stale }: UnifiedDiffViewProps) {
    const t = useTranslations("diff.workbench");
    const starts = runStarts(entries, (line) => line.kind !== "equal");

    return (
        <ViewerFrame stale={stale} scroll={false}>
            <table className="w-full table-fixed border-collapse font-mono text-[0.8125rem] leading-6">
                <caption className="sr-only">{t("title")}</caption>
                <colgroup>
                    <col className="w-11" />
                    <col className="w-11" />
                    <col className="w-4" />
                    <col />
                </colgroup>
                <tbody>
                    {entries.map((entry, index) =>
                        entry.kind === "gap" ? (
                            <GapRow key={`gap-${index}`} hidden={entry.hidden} columns={4} />
                        ) : (
                            <tr
                                key={`line-${index}`}
                                data-change={starts.get(index)}
                                className={cn(
                                    "scroll-mt-24",
                                    entry.item.kind === "remove" && ROW_TONE.removed,
                                    entry.item.kind === "add" && ROW_TONE.added,
                                )}
                            >
                                <td className={NUMBER_CELL}>{entry.item.leftNumber ?? ""}</td>
                                <td className={NUMBER_CELL}>{entry.item.rightNumber ?? ""}</td>
                                <td className={SIGN_CELL} aria-hidden="true">
                                    {entry.item.kind === "remove"
                                        ? "-"
                                        : entry.item.kind === "add"
                                          ? "+"
                                          : ""}
                                </td>
                                <td className={TEXT_CELL}>
                                    {entry.item.kind !== "equal" && (
                                        <span className="sr-only">
                                            {t(
                                                `rowTypes.${entry.item.kind === "add" ? "insert" : "delete"}`,
                                            )}{" "}
                                        </span>
                                    )}
                                    <SegmentText
                                        text={entry.item.text}
                                        segments={entry.item.segments}
                                    />
                                    {entry.item.ignoredDifference && (
                                        <span
                                            title={t("ignoredMarker")}
                                            className="text-brand-amber ml-1.5 align-middle text-[0.625rem] select-none"
                                        >
                                            ≈<span className="sr-only">{t("ignoredMarker")}</span>
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ),
                    )}
                </tbody>
            </table>
        </ViewerFrame>
    );
}
