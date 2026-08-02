"use client";

import { IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { editParam, removeParam } from "../domain/params";
import type { UrlQueryParam } from "../types";

const BLANK: UrlQueryParam = { key: "", value: "" };

const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.35fr)_auto] items-center gap-2";

type QueryParamsPanelProps = {
    /** `null` while the box holds something that is not a URL. */
    params: readonly UrlQueryParam[] | null;
    onChange: (next: readonly UrlQueryParam[]) => void;
};

/**
 * The query string as editable pairs. Every row is derived from the URL above
 * rather than held here, so the two can never drift apart — an edit rebuilds
 * the link, and the link is what the next render reads back.
 */
export function QueryParamsPanel({ params, onChange }: QueryParamsPanelProps) {
    const t = useTranslations("urlParser.params");

    if (params === null) {
        return (
            <p className="text-muted-foreground text-[0.8125rem] leading-relaxed">
                {t("unavailable")}
            </p>
        );
    }

    // The trailing blank row is the affordance for adding a parameter: typing
    // into it appends, and `buildQueryString` ignores a pair with neither half.
    const rows = [...params, BLANK];

    return (
        <div className="flex flex-col gap-2">
            <div className={ROW_GRID} aria-hidden="true">
                <span className="text-muted-foreground text-xs leading-[1.3]">
                    {t("keyHeader")}
                </span>
                <span className="text-muted-foreground text-xs">=</span>
                <span className="text-muted-foreground text-xs leading-[1.3]">
                    {t("valueHeader")}
                </span>
                <span className="size-7" />
            </div>

            {rows.map((param, index) => {
                const isBlankRow = index === params.length;

                return (
                    <div key={index} className={ROW_GRID}>
                        <Input
                            value={param.key}
                            onChange={(event) =>
                                onChange(editParam(params, index, { key: event.target.value }))
                            }
                            placeholder={t("keyPlaceholder")}
                            aria-label={t("keyLabel", { index: index + 1 })}
                            spellCheck={false}
                            autoComplete="off"
                            className="h-9 rounded-lg font-mono text-[0.8125rem]"
                        />
                        <span className="text-muted-foreground text-sm" aria-hidden="true">
                            =
                        </span>
                        <Input
                            value={param.value}
                            onChange={(event) =>
                                onChange(editParam(params, index, { value: event.target.value }))
                            }
                            placeholder={t("valuePlaceholder")}
                            aria-label={t("valueLabel", { index: index + 1 })}
                            spellCheck={false}
                            autoComplete="off"
                            className="h-9 rounded-lg font-mono text-[0.8125rem]"
                        />
                        {isBlankRow ? (
                            <span className="size-7" />
                        ) : (
                            <button
                                type="button"
                                onClick={() => onChange(removeParam(params, index))}
                                aria-label={
                                    param.key.length > 0
                                        ? t("remove", { key: param.key })
                                        : t("removeBlank")
                                }
                                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-ring grid size-7 shrink-0 place-items-center rounded-lg transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                            >
                                <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                            </button>
                        )}
                    </div>
                );
            })}

            <div className="flex flex-wrap items-center gap-2 pt-1">
                {params.length === 0 && (
                    <p className="text-muted-foreground min-w-0 flex-1 text-[0.6875rem] leading-[1.4]">
                        {t("empty")}
                    </p>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange([])}
                    disabled={params.length === 0}
                    className="ml-auto"
                >
                    {t("clearAll")}
                </Button>
            </div>
        </div>
    );
}
