"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText } from "@/modules/tools/domain/clipboard";
import { INSPECTOR_WINDOW_BYTES } from "../domain/constants";
import { formatOffset } from "../domain/format";
import { readInspector } from "../domain/inspector";
import { ENDIANNESS, type Endianness, type InspectorKey } from "../types";
import { useHexStore } from "./hex-store";

/**
 * Nineteen readings of the bytes under the caret.
 *
 * Every row is rendered whether or not it has a value, so switching endianness
 * or nudging the caret changes numbers rather than reflowing a panel. A row the
 * document has run out of bytes for shows a dash and keeps its place, which is
 * how a reader four bytes from the end can see that `Int64` did not fit.
 *
 * The labels are not translated — `UInt24` and `GUID` are proper names, and
 * `domain/inspector.ts` owns them. Only the heading and the endianness control
 * are copy.
 */
export function DataInspector() {
    const t = useTranslations("hexEditor.inspector");
    const tEndian = useTranslations("hexEditor.endianness");

    const document = useHexStore((state) => state.document);
    const revision = useHexStore((state) => state.revision);
    const focus = useHexStore((state) => state.selection.focus);
    const endian = useHexStore((state) => state.endian);
    const setEndian = useHexStore((state) => state.setEndian);

    const [copied, markCopied] = useCopyFeedback<InspectorKey>();

    // `revision` is a dependency rather than decoration: the document is mutable
    // by design, so the bumped counter is the only thing that says the bytes
    // under the caret are not the ones this panel last read.
    const readings = useMemo(
        () =>
            readInspector(
                document?.slice(focus, focus + INSPECTOR_WINDOW_BYTES) ?? new Uint8Array(0),
                endian,
            ),
        [document, focus, endian, revision],
    );

    const endianItems = useMemo(
        () => Object.fromEntries(ENDIANNESS.map((value) => [value, tEndian(value)])),
        [tEndian],
    );

    async function handleCopy(key: InspectorKey, value: string) {
        const result = await copyText(value);

        if (result.ok) {
            markCopied(key);
        }
    }

    return (
        <div className="flex h-full min-w-0 flex-col gap-3 overflow-y-auto p-3">
            <div className="flex flex-col gap-1.5">
                <p className="text-muted-foreground/85 text-[0.6875rem] font-semibold tracking-[0.09em] uppercase">
                    {t("title")}
                </p>
                <p className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                    {document === null
                        ? t("noFile")
                        : t("caretAt", { offset: formatOffset(focus) })}
                </p>
            </div>

            <div className="flex flex-col gap-1.5">
                <Label
                    id="hex-inspector-endian"
                    className="text-muted-foreground text-[0.6875rem] leading-[1.3]"
                >
                    {t("endianLabel")}
                </Label>
                <Select
                    items={endianItems}
                    value={endian}
                    onValueChange={(next) => {
                        if (next !== null) {
                            setEndian(next as Endianness);
                        }
                    }}
                >
                    <SelectTrigger aria-labelledby="hex-inspector-endian" className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {ENDIANNESS.map((value) => (
                            <SelectItem key={value} value={value}>
                                {tEndian(value)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <dl className="flex flex-col">
                {readings.map((reading) => (
                    <div
                        key={reading.key}
                        className={cn(
                            "border-border/45 group flex items-center gap-2 border-b py-1 last:border-b-0",
                            "[@media(hover:hover)]:hover:bg-muted/40 rounded-md px-1 transition-colors duration-150",
                        )}
                    >
                        <dt className="text-muted-foreground w-[5.5rem] shrink-0 font-mono text-[0.6875rem]">
                            {reading.label}
                        </dt>
                        <dd className="min-w-0 flex-1 font-mono text-[0.75rem] break-all">
                            {reading.value === null ? (
                                <span className="text-muted-foreground/50">{t("unavailable")}</span>
                            ) : (
                                reading.value
                            )}
                        </dd>
                        {reading.value !== null && (
                            <IconCopyButton
                                copied={copied === reading.key}
                                onClick={() => void handleCopy(reading.key, reading.value ?? "")}
                                aria-label={t("copyRow", { label: reading.label })}
                                className={cn(
                                    "size-6 opacity-0 focus-visible:opacity-100",
                                    "[@media(hover:hover)]:group-hover:opacity-100",
                                    "[@media(hover:none)]:opacity-100",
                                )}
                            />
                        )}
                    </div>
                ))}
            </dl>
        </div>
    );
}
