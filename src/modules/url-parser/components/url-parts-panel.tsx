"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { URL_PART_IDS, type UrlPartId, type UrlParts } from "../types";

type UrlPartsPanelProps = {
    /** `null` while the box holds something that is not a URL. */
    parts: UrlParts | null;
    copied: UrlPartId | null;
    onCopy: (part: UrlPartId) => void;
};

/**
 * Every part on its own row, empty ones included — a part the URL does not
 * carry is information too, so the row stays and says so.
 */
export function UrlPartsPanel({ parts, copied, onCopy }: UrlPartsPanelProps) {
    const t = useTranslations("urlParser.workbench");
    const tParts = useTranslations("urlParser.parts");

    return (
        <dl className="flex flex-col gap-1.5">
            {URL_PART_IDS.map((id) => {
                const value = parts?.[id] ?? "";
                const label = tParts(id);

                return (
                    <div
                        key={id}
                        className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
                    >
                        <dt className="text-muted-foreground text-right text-xs leading-[1.3]">
                            {label}
                        </dt>
                        <dd
                            className={cn(
                                "bg-muted/40 ring-border/70 min-w-0 rounded-lg px-3 py-2 ring-1 ring-inset",
                                "font-mono text-[0.8125rem] leading-[1.4] break-all",
                            )}
                        >
                            {value.length > 0 ? (
                                value
                            ) : (
                                <span className="text-muted-foreground font-sans italic">
                                    {t("empty")}
                                </span>
                            )}
                        </dd>
                        <IconCopyButton
                            copied={copied === id}
                            onClick={() => onCopy(id)}
                            disabled={value.length === 0}
                            aria-label={t("copyPart", { part: label })}
                            className="disabled:pointer-events-none disabled:opacity-40"
                        />
                    </div>
                );
            })}
        </dl>
    );
}
