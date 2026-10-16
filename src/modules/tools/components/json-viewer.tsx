"use client";

import {
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconArrowsVertical,
    IconChevronRight,
    IconDots,
    IconFold,
    IconSearch,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type UIEvent } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { highlight } from "../domain/highlight";
import {
    collapseAllTargets,
    findJsonFolds,
    longestLineColumns,
    revealRange,
    splitLines,
    visibleLines,
    type JsonFold,
} from "../domain/json-outline";
import {
    findLineMatches,
    markTokens,
    stepMatchIndex,
    type LineMark,
    type LineSearchResult,
} from "../domain/line-search";
import { MarkedTokenSpans, TokenSpans } from "./code-block";
import { ToolbarIconButton } from "./toolbar-icon-button";
import { ViewerSearchBar } from "./viewer-search-bar";

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
 *
 * **Search is the viewer's own** (`searchable`), because the browser's find
 * cannot see rows that are not rendered. Stepping to a match opens whatever
 * folds hide it and scrolls by the same arithmetic the rows are laid out by.
 *
 * **Full screen** (`fullscreenTitle`) moves the same toolbar and rows into a
 * sheet over the page. The state lives here, above both places, so the folds,
 * the search and the scroll offset all survive the move in either direction.
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

const NO_MARKS: readonly LineMark[] = [];

const NO_SEARCH: LineSearchResult = { matches: [], truncated: false };

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
    /** Adds a find bar, opened from the toolbar or with Ctrl+F inside the viewer. */
    searchable?: boolean;
    /** Adds a full screen button; the text names the sheet for screen readers. */
    fullscreenTitle?: string;
};

export function JsonViewer({
    code,
    labelledBy,
    placeholder,
    pending,
    className,
    searchable = false,
    fullscreenTitle,
}: JsonViewerProps) {
    const t = useTranslations("codeViewer");
    const scrollRef = useRef<HTMLDivElement | null>(null);
    /** Where the reader was, so a scroller remounted by full screen opens there. */
    const lastScroll = useRef({ top: 0, left: 0 });
    /** A vertical offset decided by a handler, written once the rows exist. */
    const pendingScroll = useRef<number | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewport, setViewport] = useState(INITIAL_VIEWPORT);
    const [collapsed, setCollapsed] = useState(NOTHING_COLLAPSED);
    const [collapsedFor, setCollapsedFor] = useState(code);
    const [fullscreen, setFullscreen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchFocus, setSearchFocus] = useState(0);
    const [query, setQuery] = useState("");
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [activeMatch, setActiveMatch] = useState(0);
    // A counter rather than a flag, so stepping to a second match on the same
    // row still asks for the sideways scroll that brings it into view.
    const [scrollRequest, setScrollRequest] = useState(0);

    // A fold is a line number, and a new document's line 40 is a different
    // value. Reset during render rather than in an effect, so the stale set is
    // never painted against the new text. The match index goes with it.
    if (collapsedFor !== code) {
        setCollapsedFor(code);
        setCollapsed(NOTHING_COLLAPSED);
        setActiveMatch(0);
    }

    // A callback ref rather than an effect: full screen swaps the scroller for
    // another, and the observer and the scroll offset have to follow whichever
    // one is mounted. The box is resizable, and its caller may cap it with
    // `max-h`, so its height is observed rather than assumed.
    const attachScroller = useCallback((node: HTMLDivElement | null) => {
        scrollRef.current = node;

        if (node === null) {
            return;
        }

        node.scrollTop = lastScroll.current.top;
        node.scrollLeft = lastScroll.current.left;

        const observer = new ResizeObserver(() => setViewport(node.clientHeight));

        observer.observe(node);

        return () => {
            observer.disconnect();

            if (scrollRef.current === node) {
                scrollRef.current = null;
            }
        };
    }, []);

    // Runs after the rows a step scrolled to have rendered: the vertical offset
    // was worked out by arithmetic in the handler, but how far sideways the match
    // sits can only be read off the span that draws it.
    useEffect(() => {
        const node = scrollRef.current;

        if (scrollRequest === 0 || node === null) {
            return;
        }

        if (pendingScroll.current !== null) {
            node.scrollTop = pendingScroll.current;
            pendingScroll.current = null;
        }

        const mark = node.querySelector("[data-match=active]");
        const gutter = node.querySelector("[data-gutter]");

        if (mark === null) {
            return;
        }

        const box = node.getBoundingClientRect();
        const target = mark.getBoundingClientRect();
        const left = box.left + (gutter?.getBoundingClientRect().width ?? 0);

        if (target.left < left || target.right > box.right) {
            node.scrollLeft += target.left - (left + box.right) / 2 + target.width / 2;
        }
    }, [scrollRequest]);

    const lines = splitLines(code);
    const folds = findJsonFolds(code);
    const rows = visibleLines(lines.length, folds, collapsed);
    const search = searchOpen ? findLineMatches(lines, query, { caseSensitive }) : NO_SEARCH;
    const activeIndex = Math.min(activeMatch, Math.max(0, search.matches.length - 1));
    const marksByLine = groupMarks(search, activeIndex);
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
        const { scrollTop: top, scrollLeft: left } = event.currentTarget;

        lastScroll.current = { top, left };
        setScrollTop(top);
    }

    /**
     * Makes match `index` the active one: opens the folds that hide it, and
     * centres its row unless the row is already on screen. The offset is worked
     * out here, from the rows as they will be once the folds have opened, and
     * set as state straight away so that the render it causes already holds
     * the row — the effect then only has to tell the browser.
     */
    function goToMatch(index: number, result: LineSearchResult) {
        const match = result.matches[index];

        setActiveMatch(index);

        if (match === undefined) {
            return;
        }

        const nextCollapsed = revealRange(collapsed, folds, match.line, match.start, match.end);
        const nextRows =
            nextCollapsed === collapsed ? rows : visibleLines(lines.length, folds, nextCollapsed);
        // A match in a collapsed fold's closing tail is drawn on the fold's
        // first row, so that is the row to bring into view.
        const rowLine = nextRows.includes(match.line)
            ? match.line
            : ([...nextCollapsed].find((start) => folds.get(start)?.endLine === match.line) ??
              match.line);
        const rowTop = PADDING_Y + Math.max(0, nextRows.indexOf(rowLine)) * ROW_HEIGHT;
        const onScreen = rowTop >= scrollTop && rowTop + ROW_HEIGHT <= scrollTop + viewport;

        if (!onScreen) {
            const height = nextRows.length * ROW_HEIGHT + PADDING_Y * 2;
            const top = Math.max(
                0,
                Math.min(height - viewport, rowTop - (viewport - ROW_HEIGHT) / 2),
            );

            pendingScroll.current = top;
            lastScroll.current = { ...lastScroll.current, top };
            setScrollTop(top);
        }

        setCollapsed(nextCollapsed);
        setScrollRequest((request) => request + 1);
    }

    function openSearch() {
        setSearchOpen(true);
        setSearchFocus((nonce) => nonce + 1);
    }

    function closeSearch() {
        setSearchOpen(false);
        scrollRef.current?.focus();
    }

    function changeQuery(next: string) {
        setQuery(next);
        goToMatch(0, findLineMatches(lines, next, { caseSensitive }));
    }

    function changeCaseSensitive(next: boolean) {
        setCaseSensitive(next);
        goToMatch(0, findLineMatches(lines, query, { caseSensitive: next }));
    }

    function step(direction: "next" | "previous") {
        goToMatch(stepMatchIndex(activeIndex, search.matches.length, direction), search);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        // The browser's own find only sees the rows that happen to be rendered,
        // so inside the viewer the shortcut opens the one that sees them all.
        if (searchable && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
            event.preventDefault();
            openSearch();
        }
    }

    const showToolbar = !empty && (folds.size > 0 || searchable || fullscreenTitle !== undefined);

    const body = (
        <div
            onKeyDown={handleKeyDown}
            className={cn(
                "bg-muted/45 border-border/60 flex min-w-0 flex-col overflow-hidden rounded-xl border",
                "transition-opacity duration-200",
                pending && "opacity-55",
                fullscreen && "min-h-0 flex-1",
            )}
        >
            {showToolbar ? (
                <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b py-1 pr-1.5 pl-3">
                    <span className="text-muted-foreground text-[0.6875rem] tabular-nums">
                        {t("lineCount", { count: lines.length })}
                    </span>
                    <div className="flex items-center gap-0.5">
                        {folds.size > 0 ? (
                            <>
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
                            </>
                        ) : null}
                        {searchable ? (
                            <ToolbarIconButton
                                label={t("search.open")}
                                shortcut="Ctrl+F"
                                Icon={IconSearch}
                                pressed={searchOpen}
                                onClick={searchOpen ? closeSearch : openSearch}
                            />
                        ) : null}
                        {fullscreenTitle !== undefined ? (
                            <ToolbarIconButton
                                label={fullscreen ? t("exitFullscreen") : t("fullscreen")}
                                Icon={fullscreen ? IconArrowsMinimize : IconArrowsMaximize}
                                pressed={fullscreen}
                                onClick={() => setFullscreen(!fullscreen)}
                            />
                        ) : null}
                    </div>
                </div>
            ) : null}

            {searchable && searchOpen && !empty ? (
                <ViewerSearchBar
                    query={query}
                    caseSensitive={caseSensitive}
                    position={search.matches.length === 0 ? 0 : activeIndex + 1}
                    count={search.matches.length}
                    truncated={search.truncated}
                    focusNonce={searchFocus}
                    onQueryChange={changeQuery}
                    onCaseSensitiveChange={changeCaseSensitive}
                    onStep={step}
                    onClose={closeSearch}
                />
            ) : null}

            <div
                ref={attachScroller}
                // A scrollable region has to be reachable from the keyboard,
                // which is what the tabIndex is for.
                role="region"
                aria-labelledby={labelledBy}
                tabIndex={0}
                onScroll={handleScroll}
                className={cn(
                    "relative min-h-0 overflow-auto font-mono text-[0.8125rem]",
                    "focus-visible:ring-ring outline-none focus-visible:ring-2 focus-visible:ring-inset",
                    // The caller's sizing is for the page; in full screen the
                    // sheet decides the height.
                    fullscreen ? "flex-1" : className,
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
                                data-gutter
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
                                            <ViewerLine
                                                text={lines[line]}
                                                offset={0}
                                                marks={marksByLine.get(line) ?? NO_MARKS}
                                            />
                                        </div>
                                    ) : (
                                        <div key={line} className={ROW_CLASS}>
                                            <ViewerLine
                                                text={lines[line].slice(0, fold.openEnd)}
                                                offset={0}
                                                marks={marksByLine.get(line) ?? NO_MARKS}
                                            />
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
                                                offset={fold.closeStart}
                                                marks={marksByLine.get(fold.endLine) ?? NO_MARKS}
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

    if (fullscreenTitle === undefined) {
        return body;
    }

    return (
        <>
            {fullscreen ? (
                <div className="border-border/60 bg-muted/25 flex flex-col items-start gap-3 rounded-xl border p-4">
                    <p className="text-muted-foreground text-[0.8125rem] leading-6">
                        {t("fullscreenActive")}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => setFullscreen(false)}>
                        <IconArrowsMinimize className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("exitFullscreen")}
                    </Button>
                </div>
            ) : (
                body
            )}

            {/* A sheet rather than the Fullscreen API: it works on the phones
                that refuse an element full screen, and brings the focus trap
                and the Escape key with it. The viewer's own toolbar is the top
                of the sheet and holds the control that leaves, so the title is
                for screen readers only. */}
            <Sheet open={fullscreen} onOpenChange={setFullscreen}>
                <SheetContent
                    side="bottom"
                    showCloseButton={false}
                    className="bg-background text-foreground w-full max-w-none gap-0 rounded-none p-2 data-[side=bottom]:inset-0 data-[side=bottom]:h-full data-[side=bottom]:border-t-0 sm:max-w-none sm:p-4"
                >
                    <SheetTitle className="sr-only">{fullscreenTitle}</SheetTitle>
                    <SheetDescription className="sr-only">
                        {t("fullscreenDescription")}
                    </SheetDescription>

                    <div className="flex h-full min-h-0 flex-1 flex-col">
                        {fullscreen ? body : null}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}

/** Each match as a mark on its own line, the active one flagged. */
function groupMarks(search: LineSearchResult, activeIndex: number): Map<number, LineMark[]> {
    const byLine = new Map<number, LineMark[]>();

    search.matches.forEach((match, index) => {
        const marks = byLine.get(match.line) ?? [];

        marks.push({ start: match.start, end: match.end, active: index === activeIndex });
        byLine.set(match.line, marks);
    });

    return byLine;
}

type ViewerLineProps = {
    text: string;
    /** The column `text` starts at on its line, which is what `marks` count in. */
    offset: number;
    marks: readonly LineMark[];
};

/** Its own component so a row whose text and marks have not changed is not rescanned. */
function ViewerLine({ text, offset, marks }: ViewerLineProps) {
    const tokens = highlight(text, "json", LINE_HIGHLIGHT_LIMIT);

    return marks.length === 0 ? (
        <TokenSpans tokens={tokens} />
    ) : (
        <MarkedTokenSpans tokens={markTokens(tokens, offset, marks)} />
    );
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
