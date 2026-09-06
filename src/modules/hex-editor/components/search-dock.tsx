"use client";

import { IconChevronDown, IconChevronUp, IconSearch, IconX } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import {
    MAX_SEARCH_MATCHES,
    MAX_SEARCH_PATTERN_BYTES,
    MAX_SEARCH_QUERY_LENGTH,
} from "../domain/constants";
import { matchIndexAt } from "../domain/search";
import { SEARCH_MODES, type SearchFailureReason, type SearchMode } from "../types";
import { HexIconButton } from "./hex-icon-button";
import { useHexStore } from "./hex-store";

/**
 * Find, in ASCII or in hex — a bar above the grid rather than a dialog over it.
 *
 * It was a dialog first, and that was the wrong shape for this tool: what a
 * search answers with here is *highlighted bytes*, and a panel in the middle of
 * the window covers the rows it just highlighted. Every match, the caret it
 * moved and the row it scrolled to have to stay visible while the reader steps
 * through them, so the bar takes a strip of the editor's own height and leaves
 * the rest of the grid alone.
 *
 * The scan still runs on submit rather than on every keystroke, which is the one
 * place in this tool that deliberately breaks the repository's 300 ms debounce
 * habit: a search here is linear in a file that can be half a gigabyte, and a
 * debounce would still mean a full scan every time the reader paused. Pressing
 * Enter is a decision, and the result is worth the wait once.
 */
export function SearchDock({
    open,
    focusNonce,
    onClose,
}: {
    open: boolean;
    /** Bumped by every request to open the bar, including while it is open. */
    focusNonce: number;
    onClose: () => void;
}) {
    const t = useTranslations("hexEditor.search");
    const tModes = useTranslations("hexEditor.searchModes");
    const tErrors = useTranslations("hexEditor.errors");
    const formatter = useFormatter();

    const queryId = useId();
    const statusId = useId();

    const inputRef = useRef<HTMLInputElement>(null);

    const query = useHexStore((state) => state.searchQuery);
    const mode = useHexStore((state) => state.searchMode);
    const matches = useHexStore((state) => state.matches);
    const truncated = useHexStore((state) => state.matchesTruncated);
    const focus = useHexStore((state) => state.selection.focus);
    const setSearchQuery = useHexStore((state) => state.setSearchQuery);
    const setSearchMode = useHexStore((state) => state.setSearchMode);
    const runSearch = useHexStore((state) => state.runSearch);
    const clearSearch = useHexStore((state) => state.clearSearch);
    const goToAdjacentMatch = useHexStore((state) => state.goToAdjacentMatch);

    // Local rather than in the store: a parse failure belongs to this box, and
    // nothing outside the bar has any use for it.
    const [failure, setFailure] = useState<SearchFailureReason | null>(null);
    const [ran, setRan] = useState(false);

    // Opening from Ctrl+F or the toolbar has to land the caret in the field. The
    // bar sits in the editor's own flow rather than in a dialog, so nothing else
    // is going to move focus for it.
    useEffect(() => {
        if (open) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [open, focusNonce]);

    if (!open) {
        return null;
    }

    function describe(reason: SearchFailureReason): string {
        switch (reason) {
            case "empty_query":
                return tErrors("searchEmpty");
            case "invalid_hex":
                return tErrors("searchInvalidHex");
            case "odd_hex_length":
                return tErrors("searchOddHex");
            case "not_single_byte":
                return tErrors("searchNotSingleByte");
            case "too_long":
                return tErrors("searchTooLong", {
                    max: formatter.number(MAX_SEARCH_PATTERN_BYTES),
                });
        }
    }

    function handleSubmit() {
        const outcome = runSearch();

        setRan(true);
        setFailure(outcome.ok ? null : outcome.reason);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Escape") {
            // Stopped here rather than left to bubble: in full screen the same
            // key closes the dialog the whole editor is sitting in, and one
            // press should shut one thing.
            event.preventDefault();
            event.stopPropagation();
            onClose();

            return;
        }

        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();

        // Enter means "find" until something has been found and "the next one"
        // afterwards, which is what makes stepping through a file one held key
        // rather than a reach for the mouse.
        if (!ran || matches.length === 0) {
            handleSubmit();

            return;
        }

        goToAdjacentMatch(event.shiftKey ? "previous" : "next");
    }

    const status: { tone: StatusTone; message: string } | null =
        failure !== null
            ? { tone: "error", message: describe(failure) }
            : !ran
              ? null
              : matches.length === 0
                ? { tone: "warning", message: t("noMatches") }
                : {
                      tone: truncated ? "warning" : "success",
                      message: truncated
                          ? t("foundTruncated", {
                                count: formatter.number(matches.length),
                                max: formatter.number(MAX_SEARCH_MATCHES),
                            })
                          : t("found", { count: formatter.number(matches.length) }),
                  };

    const position = matchIndexAt(matches, focus);

    return (
        <div
            role="search"
            aria-label={t("title")}
            className="border-border/70 bg-muted/25 flex shrink-0 flex-col gap-1.5 border-b px-2 py-2"
        >
            <div className="flex flex-wrap items-center gap-1.5">
                <div
                    role="group"
                    aria-label={t("modeGroup")}
                    className="bg-muted/60 flex shrink-0 items-center gap-0.5 rounded-lg p-0.5"
                >
                    {SEARCH_MODES.map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => {
                                setSearchMode(value as SearchMode);
                                setFailure(null);
                                setRan(false);
                            }}
                            aria-pressed={mode === value}
                            className={cn(
                                "rounded-md px-2 py-1 text-[0.6875rem] font-medium transition-colors duration-200",
                                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                mode === value
                                    ? "bg-card text-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {tModes(value)}
                        </button>
                    ))}
                </div>

                <Label htmlFor={queryId} className="sr-only">
                    {t("queryLabel")}
                </Label>
                <Input
                    id={queryId}
                    ref={inputRef}
                    value={query}
                    spellCheck={false}
                    autoComplete="off"
                    // A short field over a fixed-width needle, so a hard cap
                    // costs nothing: one character over is a mistake, not a
                    // truncated document.
                    maxLength={MAX_SEARCH_QUERY_LENGTH}
                    aria-describedby={statusId}
                    placeholder={mode === "hex" ? t("placeholderHex") : t("placeholderAscii")}
                    onChange={(event) => {
                        setSearchQuery(event.target.value);
                        setFailure(null);
                        setRan(false);
                    }}
                    onKeyDown={handleKeyDown}
                    className="h-8 min-w-0 flex-1 basis-40 font-mono text-[0.8125rem]"
                />

                <Button onClick={handleSubmit} size="sm" className="h-8 shrink-0">
                    <IconSearch className="size-3.5" stroke={1.8} aria-hidden="true" />
                    {t("run")}
                </Button>

                {/* The position sits between the two step buttons, where it says
                    what pressing either of them is about to change. It is read
                    off the caret rather than off a stored index, so clicking a
                    byte or jumping with Go To moves it too. */}
                <div className="flex shrink-0 items-center gap-0.5">
                    <HexIconButton
                        label={t("previous")}
                        shortcut="Shift+Enter"
                        Icon={IconChevronUp}
                        disabled={matches.length === 0}
                        onClick={() => goToAdjacentMatch("previous")}
                    />
                    {matches.length > 0 && (
                        <span className="text-muted-foreground min-w-14 text-center font-mono text-[0.6875rem] tabular-nums">
                            {t("counter", {
                                index: position === 0 ? "–" : formatter.number(position),
                                count: formatter.number(matches.length),
                            })}
                        </span>
                    )}
                    <HexIconButton
                        label={t("next")}
                        shortcut="Enter"
                        Icon={IconChevronDown}
                        disabled={matches.length === 0}
                        onClick={() => goToAdjacentMatch("next")}
                    />
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    disabled={matches.length === 0}
                    onClick={() => {
                        clearSearch();
                        setRan(false);
                    }}
                    className="h-8 shrink-0"
                >
                    {t("clear")}
                </Button>

                <div className="ml-auto shrink-0 pl-1">
                    <HexIconButton
                        label={t("close")}
                        shortcut="Esc"
                        Icon={IconX}
                        onClick={onClose}
                    />
                </div>
            </div>

            {/* The hint holds the line until a search has been run and the
                verdict replaces it, so the row under the field never appears or
                disappears and the grid below never jumps. */}
            {status !== null ? (
                <StatusStrip id={statusId} tone={status.tone} message={status.message} />
            ) : (
                <p
                    id={statusId}
                    className="text-muted-foreground/85 text-[0.6875rem] leading-normal"
                >
                    {mode === "hex" ? t("hintHex") : t("hintAscii")}
                </p>
            )}
        </div>
    );
}
