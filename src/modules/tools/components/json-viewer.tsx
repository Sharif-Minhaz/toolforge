"use client";

import { IconArrowsVertical, IconChevronRight, IconDots, IconFold } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type UIEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { highlight } from "../domain/highlight";
import {
    collapseAllTargets,
    findJsonFolds,
    longestLineColumns,
    splitLines,
    visibleLines,
    type JsonFold,
} from "../domain/json-outline";
import { TokenSpans } from "./code-block";

/**
 * Read-only JSON with line numbers, folding, and colour at any length.
 *
 * **Only the rows on screen exist.** A formatted 700 KB response is twenty-odd
 * thousand lines; painting all of them as spans is what used to force a length
 * ceiling past which the whole document went monochrome. Rows here are a fixed
 * height and never wrap, so which ones are visible is arithmetic on the scroll
 * offset, and each row highlights only its own line. JSON has no token that
 * crosses a newline, so the colour is the same as scanning the document whole.
 * The cost is that the browser's find and select-all only see what is
 * rendered — which is why every caller keeps its Copy button.
 *
 * **Line numbers are generated content** (`content: attr(data-line)`) in a
 * gutter of their own, so no selection can pick them up — dragging across the
 * code copies the code and nothing else. The gutter is sticky, so the numbers
 * stay put while a long line scrolls sideways under them.
 *
 * **A collapsed fold is one row**: its first line up to the opening bracket, a
 * marker, and the closing line's tail — `"address": {…},` — so the shape of the
 * surrounding document still reads correctly.
 */

/** Must equal the `h-[24px] leading-[24px]` on every row: the list is laid out by arithmetic. */
const ROW_HEIGHT = 24;
const ROW_CLASS = "h-[24px] leading-[24px]";

/** Matches `py-3`, the space above the first row and below the last. */
const PADDING_Y = 12;

/** Rows drawn past each edge, so a fast scroll does not show a blank band. */
const OVERSCAN = 30;

/**
 * Assumed until the box has been measured. Generous, so the first paint fills
 * any height a caller gives the box; the server renders with it too, which keeps
 * the first client render identical.
 */
const INITIAL_VIEWPORT = 640;

/**
 * Per line, not per document. One row scanning a long line costs only that row,
 * so this can sit ten times above the editor's ceiling — it is minified output,
 * all on one line, that reaches it.
 */
const LINE_HIGHLIGHT_LIMIT = 200_000;

const NOTHING_COLLAPSED: ReadonlySet<number> = new Set();

type JsonViewerProps = {
    code: string;
    /** Id of the element naming this region, since a scrolling `<div>` takes no label. */
    labelledBy?: string;
    /** Shown in place of the code when there is nothing to render yet. */
    placeholder?: string;
    /** Dimmed while a debounced input has yet to reach the converter. */
    pending?: boolean;
    /** Sizing for the scrolling area — `h-72 resize-y`, `max-h-96` and so on. */
    className?: string;
};

export function JsonViewer({ code, labelledBy, placeholder, pending, className }: JsonViewerProps) {
    const t = useTranslations("codeViewer");
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewport, setViewport] = useState(INITIAL_VIEWPORT);
    const [collapsed, setCollapsed] = useState(NOTHING_COLLAPSED);
    const [collapsedFor, setCollapsedFor] = useState(code);

    // A fold is a line number, and a new document's line 40 is a different
    // value. Reset during render rather than in an effect, so the stale set is
    // never painted against the new text.
    if (collapsedFor !== code) {
        setCollapsedFor(code);
        setCollapsed(NOTHING_COLLAPSED);
    }

    // The box is resizable, and its caller may cap it with `max-h`, so its
    // height is observed rather than assumed.
    useEffect(() => {
        const node = scrollRef.current;

        if (node === null) {
            return;
        }

        const observer = new ResizeObserver(() => setViewport(node.clientHeight));

        observer.observe(node);

        return () => observer.disconnect();
    }, []);

    const lines = splitLines(code);
    const folds = findJsonFolds(code);
    const rows = visibleLines(lines.length, folds, collapsed);
    const columns = longestLineColumns(lines);
    const gutter = `calc(${String(lines.length).length}ch + 2.25rem)`;

    const first = Math.max(0, Math.floor((scrollTop - PADDING_Y) / ROW_HEIGHT) - OVERSCAN);
    const last = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
    const windowRows = rows.slice(first, last);
    const empty = code.length === 0;

    function toggle(line: number) {
        setCollapsed((current) => {
            const next = new Set(current);

            if (!next.delete(line)) {
                next.add(line);
            }

            return next;
        });
    }

    function collapseAll() {
        setCollapsed(collapseAllTargets(folds));
        // Most of what was above the old offset is gone; the top is the only
        // place that still means anything.
        scrollRef.current?.scrollTo({ top: 0 });
    }

    function handleScroll(event: UIEvent<HTMLDivElement>) {
        setScrollTop(event.currentTarget.scrollTop);
    }

    return (
        <div
            className={cn(
                "bg-muted/45 border-border/60 flex min-w-0 flex-col overflow-hidden rounded-xl border",
                "transition-opacity duration-200",
                pending && "opacity-55",
            )}
        >
            {!empty && folds.size > 0 ? (
                <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b py-1 pr-1.5 pl-3">
                    <span className="text-muted-foreground text-[0.6875rem] tabular-nums">
                        {t("lineCount", { count: lines.length })}
                    </span>
                    <div className="flex items-center gap-0.5">
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={collapseAll}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <IconFold stroke={1.9} aria-hidden="true" />
                            {t("collapseAll")}
                        </Button>
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setCollapsed(NOTHING_COLLAPSED)}
                            disabled={collapsed.size === 0}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <IconArrowsVertical stroke={1.9} aria-hidden="true" />
                            {t("expandAll")}
                        </Button>
                    </div>
                </div>
            ) : null}

            <div
                ref={scrollRef}
                // A scrollable region has to be reachable from the keyboard,
                // which is what the tabIndex is for.
                role="region"
                aria-labelledby={labelledBy}
                tabIndex={0}
                onScroll={handleScroll}
                className={cn(
                    "relative min-h-0 overflow-auto font-mono text-[0.8125rem]",
                    "focus-visible:ring-ring outline-none focus-visible:ring-2 focus-visible:ring-inset",
                    className,
                )}
                // The gutter's stripe runs the full height of the box, not just
                // as far as the rows do. A background on the scroller does not
                // scroll, which is exactly what a sticky column needs.
                style={
                    empty
                        ? undefined
                        : {
                              backgroundImage: `linear-gradient(to right, var(--muted) ${gutter}, transparent ${gutter})`,
                          }
                }
            >
                {empty ? (
                    <p className="text-muted-foreground p-3 leading-6">{placeholder}</p>
                ) : (
                    <div
                        className="relative min-w-full"
                        style={{
                            height: rows.length * ROW_HEIGHT + PADDING_Y * 2,
                            width: `calc(${gutter} + ${columns}ch + 1.5rem)`,
                        }}
                    >
                        <div
                            className="absolute inset-x-0 flex"
                            style={{ top: PADDING_Y + first * ROW_HEIGHT }}
                        >
                            <div
                                className="bg-muted text-muted-foreground/60 sticky left-0 z-10 shrink-0 tabular-nums select-none"
                                style={{ width: gutter }}
                            >
                                {windowRows.map((line) => (
                                    <GutterRow
                                        key={line}
                                        line={line}
                                        fold={folds.get(line)}
                                        collapsed={collapsed.has(line)}
                                        onToggle={toggle}
                                        label={(fold, isCollapsed) =>
                                            t(isCollapsed ? "expand" : "collapse", {
                                                start: fold.startLine + 1,
                                                end: fold.endLine + 1,
                                            })
                                        }
                                    />
                                ))}
                            </div>

                            <div className="min-w-0 flex-1 px-3 whitespace-pre">
                                {windowRows.map((line) => {
                                    const fold = collapsed.has(line) ? folds.get(line) : undefined;

                                    return fold === undefined ? (
                                        <div key={line} className={ROW_CLASS}>
                                            <ViewerLine text={lines[line]} />
                                        </div>
                                    ) : (
                                        <div key={line} className={ROW_CLASS}>
                                            <ViewerLine text={lines[line].slice(0, fold.openEnd)} />
                                            <button
                                                type="button"
                                                // The gutter's toggle is the
                                                // keyboard path; this is a larger
                                                // target for the pointer.
                                                tabIndex={-1}
                                                onClick={() => toggle(line)}
                                                aria-label={t("expand", {
                                                    start: fold.startLine + 1,
                                                    end: fold.endLine + 1,
                                                })}
                                                title={t("expand", {
                                                    start: fold.startLine + 1,
                                                    end: fold.endLine + 1,
                                                })}
                                                className="bg-muted text-muted-foreground hover:text-foreground ring-border mx-1 inline-flex h-4 items-center rounded px-1 align-middle ring-1 select-none"
                                            >
                                                <IconDots className="size-3" aria-hidden="true" />
                                            </button>
                                            <ViewerLine
                                                text={lines[fold.endLine].slice(fold.closeStart)}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/** Its own component so a row whose text has not changed is not rescanned. */
function ViewerLine({ text }: { text: string }) {
    return <TokenSpans tokens={highlight(text, "json", LINE_HIGHLIGHT_LIMIT)} />;
}

type GutterRowProps = {
    line: number;
    fold: JsonFold | undefined;
    collapsed: boolean;
    onToggle: (line: number) => void;
    label: (fold: JsonFold, collapsed: boolean) => string;
};

function GutterRow({ line, fold, collapsed, onToggle, label }: GutterRowProps) {
    return (
        <div className={cn(ROW_CLASS, "flex items-center justify-end gap-1 pr-1.5")}>
            <span
                aria-hidden="true"
                data-line={line + 1}
                className="before:content-[attr(data-line)]"
            />
            {fold === undefined ? (
                <span className="size-4 shrink-0" aria-hidden="true" />
            ) : (
                <button
                    type="button"
                    onClick={() => onToggle(line)}
                    aria-expanded={!collapsed}
                    aria-label={label(fold, collapsed)}
                    className="hover:text-foreground focus-visible:ring-ring text-muted-foreground grid size-4 shrink-0 place-items-center rounded-sm outline-none focus-visible:ring-2"
                >
                    <IconChevronRight
                        className={cn(
                            "size-3 motion-safe:transition-transform motion-safe:duration-150",
                            !collapsed && "rotate-90",
                        )}
                        stroke={2.2}
                        aria-hidden="true"
                    />
                </button>
            )}
        </div>
    );
}
