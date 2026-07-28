"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import type { ColorFormat, FormattedColor } from "../types";

type FormatRowsProps = {
    rows: readonly FormattedColor[];
    /** The format whose copy button is currently showing a check. */
    copied: ColorFormat | null;
    /** True while the typed value has yet to reach the converter. */
    pending: boolean;
    onCopy: (row: FormattedColor) => void;
};

/** The six notations, each one line, each copyable on its own. */
export function FormatRows({ rows, copied, pending, onCopy }: FormatRowsProps) {
    const t = useTranslations("color.formats");

    return (
        <ul
            className={cn(
                "flex flex-col gap-2 transition-opacity duration-200",
                pending && "opacity-55",
            )}
        >
            {rows.map((row) => (
                <li
                    key={row.format}
                    className="bg-card/60 ring-border/70 flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset"
                >
                    <span className="text-muted-foreground w-12 shrink-0 text-[0.6875rem] font-medium tracking-wide uppercase">
                        {t(`${row.format}.label`)}
                    </span>

                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <code className="truncate font-mono text-[0.8125rem] leading-[1.5]">
                            {row.value}
                        </code>
                        {row.alphaDropped && (
                            <span className="text-brand-amber text-[0.6875rem] leading-[1.4]">
                                {t("alphaDropped")}
                            </span>
                        )}
                    </span>

                    <IconCopyButton
                        copied={copied === row.format}
                        onClick={() => onCopy(row)}
                        aria-label={t("copy", { format: t(`${row.format}.label`) })}
                    />
                </li>
            ))}
        </ul>
    );
}
