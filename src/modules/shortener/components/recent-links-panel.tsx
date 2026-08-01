"use client";

import { IconExternalLink, IconHistory, IconLock, IconTrash, IconX } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import type { LinkHistoryEntry } from "../types";

type RecentLinksPanelProps = {
    entries: readonly LinkHistoryEntry[];
    onCopy: (value: string) => void;
    onForget: (slug: string) => void;
    onClear: () => void;
};

/**
 * Links this browser remembers.
 *
 * The list is local storage and nothing else — there are no accounts here, so
 * "recent" means "recent in this browser". It holds each link's edit URL, which
 * is what makes re-pointing a link possible on a return visit and is also why
 * the warning and the clear button are not optional decoration.
 */
export function RecentLinksPanel({ entries, onCopy, onForget, onClear }: RecentLinksPanelProps) {
    const t = useTranslations("shortener.history");
    const format = useFormatter();
    const hydrated = useIsHydrated();

    const [copied, setCopied] = useState<string | null>(null);

    function copy(value: string, slug: string) {
        onCopy(value);
        setCopied(slug);
    }

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <IconHistory className="text-primary size-4" stroke={1.9} aria-hidden="true" />
                    {t("title")}
                </CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
                {/* Until hydration finishes there is no storage to read, so the
                    empty state is the honest thing to show rather than a
                    skeleton that would flash for a frame. */}
                {!hydrated || entries.length === 0 ? (
                    <p className="text-muted-foreground border-border/70 rounded-xl border border-dashed px-4 py-6 text-center text-[0.8125rem]">
                        {t("empty")}
                    </p>
                ) : (
                    <>
                        <ul className="flex flex-col gap-2">
                            {entries.map((entry) => (
                                <li
                                    key={entry.slug}
                                    className="bg-card/60 ring-border/70 flex flex-col gap-2 rounded-xl px-3 py-2.5 ring-1 ring-inset"
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        <code className="min-w-0 flex-1 truncate font-mono text-[0.8125rem]">
                                            {entry.shortUrl}
                                        </code>
                                        {entry.hasPassword && (
                                            <span
                                                className="text-muted-foreground shrink-0"
                                                title={t("protected")}
                                            >
                                                <IconLock
                                                    className="size-3.5"
                                                    stroke={1.9}
                                                    aria-label={t("protected")}
                                                />
                                            </span>
                                        )}
                                        <IconCopyButton
                                            copied={copied === entry.slug}
                                            aria-label={t("copy")}
                                            onClick={() => copy(entry.shortUrl, entry.slug)}
                                        />
                                        <button
                                            type="button"
                                            aria-label={t("forget")}
                                            title={t("forget")}
                                            onClick={() => onForget(entry.slug)}
                                            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring grid size-7 shrink-0 place-items-center rounded-lg transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                                        >
                                            <IconX className="size-4" stroke={1.8} />
                                        </button>
                                    </div>

                                    <p className="text-muted-foreground min-w-0 truncate text-[0.75rem]">
                                        {entry.target}
                                    </p>

                                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem]">
                                        <span>
                                            {t("created", {
                                                date: format.dateTime(new Date(entry.createdAt), {
                                                    dateStyle: "medium",
                                                }),
                                            })}
                                        </span>
                                        {entry.expiresAt !== null && (
                                            <span>
                                                {t("expires", {
                                                    date: format.dateTime(
                                                        new Date(entry.expiresAt),
                                                        { dateStyle: "medium", timeStyle: "short" },
                                                    ),
                                                })}
                                            </span>
                                        )}
                                        <Link
                                            href={entry.editUrl}
                                            className="text-primary hover:text-primary/80 focus-visible:ring-ring inline-flex items-center gap-1 rounded font-medium focus-visible:ring-2 focus-visible:outline-none"
                                        >
                                            {t("edit")}
                                            <IconExternalLink
                                                className="size-3"
                                                stroke={1.9}
                                                aria-hidden="true"
                                            />
                                        </Link>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        <div className="border-border/70 flex flex-col gap-2 border-t pt-4">
                            <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-[1.5]">
                                {t("credentialWarning")}
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-fit"
                                onClick={onClear}
                            >
                                <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                                {t("clear")}
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
