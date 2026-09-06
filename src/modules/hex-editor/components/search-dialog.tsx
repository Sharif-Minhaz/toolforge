"use client";

import { IconChevronDown, IconChevronUp, IconSearch } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import {
    MAX_SEARCH_MATCHES,
    MAX_SEARCH_PATTERN_BYTES,
    MAX_SEARCH_QUERY_LENGTH,
} from "../domain/constants";
import { SEARCH_MODES, type SearchFailureReason, type SearchMode } from "../types";
import { useHexStore } from "./hex-store";

/**
 * Find, in ASCII or in hex.
 *
 * The scan runs on submit rather than on every keystroke, which is the one place
 * in this tool that deliberately breaks the repository's 300 ms debounce habit:
 * a search here is linear in a file that can be half a gigabyte, and a debounce
 * would still mean a full scan every time the reader paused. Pressing Enter is
 * a decision, and the result is worth the wait once.
 */
export function SearchDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const t = useTranslations("hexEditor.search");
    const tModes = useTranslations("hexEditor.searchModes");
    const tErrors = useTranslations("hexEditor.errors");
    const formatter = useFormatter();

    const queryId = useId();
    const statusId = useId();

    const query = useHexStore((state) => state.searchQuery);
    const mode = useHexStore((state) => state.searchMode);
    const matches = useHexStore((state) => state.matches);
    const truncated = useHexStore((state) => state.matchesTruncated);
    const setSearchQuery = useHexStore((state) => state.setSearchQuery);
    const setSearchMode = useHexStore((state) => state.setSearchMode);
    const runSearch = useHexStore((state) => state.runSearch);
    const clearSearch = useHexStore((state) => state.clearSearch);
    const goToAdjacentMatch = useHexStore((state) => state.goToAdjacentMatch);

    // Local rather than in the store: a parse failure belongs to this box, and
    // nothing outside the dialog has any use for it.
    const [failure, setFailure] = useState<SearchFailureReason | null>(null);
    const [ran, setRan] = useState(false);

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

        if (outcome.ok) {
            setFailure(null);

            return;
        }

        setFailure(outcome.reason);
    }

    const status: { tone: StatusTone; message: string } | null =
        failure !== null
            ? { tone: "error", message: describe(failure) }
            : !ran
              ? null
              : matches.length === 0
                ? { tone: "warning", message: t("noMatches") }
                : {
                      tone: "success",
                      message: truncated
                          ? t("foundTruncated", {
                                count: formatter.number(matches.length),
                                max: formatter.number(MAX_SEARCH_MATCHES),
                            })
                          : t("found", { count: formatter.number(matches.length) }),
                  };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    <div
                        role="group"
                        aria-label={t("modeGroup")}
                        className="bg-muted/50 flex items-center gap-0.5 self-start rounded-lg p-0.5"
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
                                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200",
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

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={queryId} className="text-muted-foreground text-xs">
                            {t("queryLabel")}
                        </Label>
                        <div className="flex items-center gap-1.5">
                            <Input
                                id={queryId}
                                value={query}
                                autoFocus
                                spellCheck={false}
                                autoComplete="off"
                                // A short field over a fixed-width needle, so a
                                // hard cap costs nothing: one character over is
                                // a mistake, not a truncated document.
                                maxLength={MAX_SEARCH_QUERY_LENGTH}
                                aria-describedby={statusId}
                                placeholder={
                                    mode === "hex" ? t("placeholderHex") : t("placeholderAscii")
                                }
                                onChange={(event) => {
                                    setSearchQuery(event.target.value);
                                    setFailure(null);
                                    setRan(false);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        handleSubmit();
                                    }
                                }}
                                className="font-mono"
                            />
                            <Button onClick={handleSubmit} size="sm">
                                <IconSearch className="size-3.5" stroke={1.8} aria-hidden="true" />
                                {t("run")}
                            </Button>
                        </div>
                        <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                            {mode === "hex" ? t("hintHex") : t("hintAscii")}
                        </p>
                    </div>

                    {status !== null && (
                        <StatusStrip id={statusId} tone={status.tone} message={status.message} />
                    )}

                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={matches.length === 0}
                            onClick={() => goToAdjacentMatch("previous")}
                        >
                            <IconChevronUp className="size-3.5" stroke={1.8} aria-hidden="true" />
                            {t("previous")}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={matches.length === 0}
                            onClick={() => goToAdjacentMatch("next")}
                        >
                            <IconChevronDown className="size-3.5" stroke={1.8} aria-hidden="true" />
                            {t("next")}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={matches.length === 0}
                            onClick={() => {
                                clearSearch();
                                setRan(false);
                            }}
                            className="ml-auto"
                        >
                            {t("clear")}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
