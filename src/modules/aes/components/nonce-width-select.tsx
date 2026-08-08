"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { GCM_NONCE_WIDTH_PRESETS } from "../domain/constants";

/**
 * How wide the GCM nonce should be drawn.
 *
 * The field has always accepted any width by paste, but a reader matching a
 * tool that demands sixteen bytes had no way to *produce* one short of typing
 * thirty-two hex characters. Changing this draws a fresh nonce at that width —
 * the picker is a generator, not a validator.
 *
 * A width outside the presets is added to the list rather than hidden, so
 * pasting a thirteen-byte nonce leaves the control showing the truth. Both
 * render passes see the same list, because it is derived from a value the
 * server sent.
 */

type NonceWidthSelectProps = {
    /** Bytes currently in the field. */
    value: number;
    onChange: (bytes: number) => void;
};

export function NonceWidthSelect({ value, onChange }: NonceWidthSelectProps) {
    const t = useTranslations("aes.workbench.advanced");
    const labelId = useId();

    const widths = [...new Set<number>([...GCM_NONCE_WIDTH_PRESETS, value])].toSorted(
        (a, b) => a - b,
    );

    const items: Record<string, ReactNode> = Object.fromEntries(
        widths.map((bytes) => [String(bytes), t("nonceWidthOption", { bytes })]),
    );

    return (
        <>
            <Label id={labelId} className="sr-only">
                {t("nonceWidthLabel")}
            </Label>
            <Select
                items={items}
                value={String(value)}
                onValueChange={(next) => {
                    if (next !== null) {
                        onChange(Number(next));
                    }
                }}
            >
                <SelectTrigger
                    aria-labelledby={labelId}
                    className="h-7 w-auto gap-1 border-none bg-transparent px-2 text-[0.6875rem] shadow-none"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {widths.map((bytes) => (
                        <SelectItem key={bytes} value={String(bytes)}>
                            {items[String(bytes)]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </>
    );
}
