"use client";

import { IconCircleCheck, IconPointFilled } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { formatOffset } from "../domain/format";
import { selectionLength } from "../domain/selection";
import { selectIsDirty, useHexStore } from "./hex-store";

/**
 * The line along the bottom: where the caret is, how much is selected, how big
 * the file is, and whether it still matches what is on disk.
 *
 * Offsets and byte counts stay in Western digits and are not run through the
 * locale's number formatter — they mirror machine input, and `০x২০` is not an
 * offset anybody can paste anywhere.
 */
export function HexStatusBar() {
    const t = useTranslations("hexEditor.status");
    const tColumns = useTranslations("hexEditor.columns");
    const tEndian = useTranslations("hexEditor.endianness");
    const formatter = useFormatter();

    const document = useHexStore((state) => state.document);
    const selection = useHexStore((state) => state.selection);
    const column = useHexStore((state) => state.column);
    const endian = useHexStore((state) => state.endian);
    const matches = useHexStore((state) => state.matches);
    const dirty = useHexStore(selectIsDirty);

    if (document === null) {
        return (
            <div className="text-muted-foreground border-border/70 flex h-8 shrink-0 items-center border-t px-3 text-[0.6875rem]">
                {t("noFile")}
            </div>
        );
    }

    const selected = selectionLength(selection);

    const fields = [
        { key: "offset", label: t("offset"), value: `0x${formatOffset(selection.focus)}` },
        { key: "decimal", label: t("decimal"), value: String(selection.focus) },
        { key: "selected", label: t("selected"), value: String(selected) },
        { key: "size", label: t("size"), value: t("bytes", { count: document.length }) },
        { key: "endian", label: t("endian"), value: tEndian(endian) },
        // The encoding the text column is read with. Fixed, and named rather
        // than translated: it is what the bytes are being decoded as.
        { key: "encoding", label: t("encoding"), value: "ASCII" },
        { key: "column", label: t("column"), value: tColumns(column) },
    ];

    return (
        <div
            className={cn(
                "border-border/70 text-muted-foreground flex h-8 shrink-0 items-center gap-x-4 gap-y-1",
                "overflow-x-auto border-t px-3 font-mono text-[0.6875rem] whitespace-nowrap",
            )}
        >
            {fields.map((field) => (
                <span key={field.key} className="flex shrink-0 items-center gap-1.5">
                    <span className="text-muted-foreground/60">{field.label}</span>
                    <span className="text-foreground/85 tabular-nums">{field.value}</span>
                </span>
            ))}

            {matches.length > 0 && (
                <span className="text-syntax-number shrink-0">
                    {t("matches", { count: formatter.number(matches.length) })}
                </span>
            )}

            <span
                className={cn(
                    "ml-auto flex shrink-0 items-center gap-1.5 pl-4",
                    dirty ? "text-syntax-call" : "text-[var(--color-success)]",
                )}
            >
                {dirty ? (
                    <IconPointFilled className="size-3" aria-hidden="true" />
                ) : (
                    <IconCircleCheck className="size-3.5" stroke={1.9} aria-hidden="true" />
                )}
                {dirty ? t("modified") : t("saved")}
            </span>
        </div>
    );
}
