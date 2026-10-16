"use client";

import {
    IconChevronDown,
    IconChevronUp,
    IconLetterCase,
    IconSearch,
    IconX,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_LINE_SEARCH_MATCHES, MAX_LINE_SEARCH_QUERY_LENGTH } from "../domain/line-search";
import { ToolbarIconButton } from "./toolbar-icon-button";

/**
 * The find bar a row-virtualized viewer docks under its toolbar.
 *
 * A bar rather than a dialog for the reason the hex editor's is one: what a
 * search answers with is highlighted text in the rows below, and anything laid
 * over them would cover the answer.
 *
 * Unlike the hex editor's, this one searches as the reader types. The rows are
 * already in memory and the scan is a substring test per line, so a debounce
 * would only make the highlights lag behind the field — which reads as broken.
 */
export function ViewerSearchBar({
    query,
    caseSensitive,
    /** One-based; zero while there is nothing to be on. */
    position,
    count,
    truncated,
    focusNonce,
    onQueryChange,
    onCaseSensitiveChange,
    onStep,
    onClose,
}: {
    query: string;
    caseSensitive: boolean;
    position: number;
    count: number;
    truncated: boolean;
    /** Bumped by every request to open the bar, including while it is open. */
    focusNonce: number;
    onQueryChange: (query: string) => void;
    onCaseSensitiveChange: (caseSensitive: boolean) => void;
    onStep: (direction: "next" | "previous") => void;
    onClose: () => void;
}) {
    const t = useTranslations("codeViewer.search");
    const formatter = useFormatter();
    const queryId = useId();
    const statusId = useId();
    const inputRef = useRef<HTMLInputElement>(null);

    // The bar sits in the viewer's own flow rather than in a dialog, so nothing
    // else is going to move focus into it — on opening, and again on Ctrl+F
    // pressed while it is already open.
    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [focusNonce]);

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Escape") {
            // Stopped here: in full screen the same key closes the dialog the
            // viewer is sitting in, and one press should shut one thing.
            event.preventDefault();
            event.stopPropagation();
            onClose();

            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            onStep(event.shiftKey ? "previous" : "next");
        }
    }

    const status =
        query.length === 0
            ? ""
            : count === 0
              ? t("noMatches")
              : t("counter", {
                    index: formatter.number(position),
                    count: truncated
                        ? t("atLeast", { count: formatter.number(MAX_LINE_SEARCH_MATCHES) })
                        : formatter.number(count),
                });

    return (
        <div
            role="search"
            aria-label={t("title")}
            className="border-border/60 bg-muted/25 flex flex-wrap items-center gap-1 border-b px-1.5 py-1.5"
        >
            <div className="relative min-w-0 flex-1 basis-40">
                <IconSearch
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
                    stroke={1.8}
                    aria-hidden="true"
                />
                <Label htmlFor={queryId} className="sr-only">
                    {t("queryLabel")}
                </Label>
                <Input
                    id={queryId}
                    ref={inputRef}
                    value={query}
                    spellCheck={false}
                    autoComplete="off"
                    // A search term, not a document: one character over is a
                    // mistake, so refusing the keystroke costs nothing.
                    maxLength={MAX_LINE_SEARCH_QUERY_LENGTH}
                    aria-describedby={statusId}
                    placeholder={t("placeholder")}
                    onChange={(event) => onQueryChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    className="h-8 pl-8 font-mono text-[0.8125rem]"
                />
            </div>

            <span
                id={statusId}
                aria-live="polite"
                className={
                    count === 0 && query.length > 0
                        ? "text-destructive min-w-16 px-1 text-center text-[0.6875rem]"
                        : "text-muted-foreground min-w-16 px-1 text-center font-mono text-[0.6875rem] tabular-nums"
                }
            >
                {status}
            </span>

            <div className="flex shrink-0 items-center">
                <ToolbarIconButton
                    label={t("matchCase")}
                    Icon={IconLetterCase}
                    pressed={caseSensitive}
                    onClick={() => onCaseSensitiveChange(!caseSensitive)}
                />
                <ToolbarIconButton
                    label={t("previous")}
                    shortcut="Shift+Enter"
                    Icon={IconChevronUp}
                    disabled={count === 0}
                    onClick={() => onStep("previous")}
                />
                <ToolbarIconButton
                    label={t("next")}
                    shortcut="Enter"
                    Icon={IconChevronDown}
                    disabled={count === 0}
                    onClick={() => onStep("next")}
                />
                <ToolbarIconButton
                    label={t("close")}
                    shortcut="Esc"
                    Icon={IconX}
                    onClick={onClose}
                />
            </div>
        </div>
    );
}
