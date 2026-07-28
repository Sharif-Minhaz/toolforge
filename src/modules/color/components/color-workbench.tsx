"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import type { StatusTone } from "@/modules/tools/components/status-strip";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { createColorExportFile } from "../domain/export";
import { formatColor } from "../domain/format";
import { inspectColor } from "../domain/inspect";
import type { ResolvedSwatch } from "../domain/matching";
import { parseColor } from "../domain/parse";
import { randomColor } from "../domain/random";
import type {
    ColorFormat,
    ColorFormatOptions,
    ColorScaleStop,
    FormattedColor,
    Hsva,
    SwatchMatch,
} from "../types";
import { ColorInput } from "./color-input";
import { ColorOptions } from "./color-options";
import { ColorPicker } from "./color-picker";
import { ColorScaleStrip } from "./color-scale-strip";
import { ContrastPanel } from "./contrast-panel";
import { FormatRows } from "./format-rows";
import { PaletteBrowser } from "./palette-browser";
import { SwatchMatches } from "./swatch-matches";

type ColorWorkbenchProps = {
    initialColor: Hsva;
    initialOptions: ColorFormatOptions;
};

export function ColorWorkbench({ initialColor, initialOptions }: ColorWorkbenchProps) {
    const t = useTranslations("color.workbench");
    const tToast = useTranslations("color.toast");
    const tErrors = useTranslations("color.errors");
    const tSyntax = useTranslations("color.syntaxes");

    const [picked, setPicked] = useState<Hsva>(initialColor);
    // `null` means the field mirrors the picked colour; a string means the user
    // is typing, and their text stays on screen exactly as they wrote it.
    const [draft, setDraft] = useState<string | null>(null);
    const [options, setOptions] = useState<ColorFormatOptions>(initialOptions);

    const [copiedFormat, markFormatCopied] = useCopyFeedback<ColorFormat>();
    const [copiedStep, markStepCopied] = useCopyFeedback<string>();

    // Re-parsing on every keystroke would re-derive the scale, both palette
    // searches, and the contrast report for each intermediate string.
    const settledDraft = useDebouncedValue(draft);
    const pending = settledDraft !== draft;

    const parsed = settledDraft === null ? null : parseColor(settledDraft);
    // A draft that does not parse leaves the last good colour on screen rather
    // than blanking every panel mid-word.
    const color = parsed?.ok ? parsed.color : picked;

    // Pure and deterministic, so the server-rendered pass already carries the
    // result and hydration has nothing to reconcile.
    const inspection = inspectColor(color, options);
    const inputValue = draft ?? formatColor("hex", color, options);

    const status: { tone: StatusTone; message: string } = (() => {
        if (pending) {
            return { tone: "pending", message: t("reading") };
        }

        if (parsed === null) {
            return { tone: "idle", message: t("hint") };
        }

        if (parsed.ok) {
            return {
                tone: "success",
                message: t("readAs", { syntax: tSyntax(parsed.syntax) }),
            };
        }

        switch (parsed.reason) {
            case "empty":
                return { tone: "idle", message: t("hint") };
            case "too_long":
                return { tone: "error", message: tErrors("tooLong") };
            case "unrecognised":
                return { tone: "error", message: tErrors("unrecognised") };
        }
    })();

    /** Any non-typed source of a colour: picker, palette, dice, eyedropper. */
    function adopt(next: Hsva) {
        setPicked(next);
        setDraft(null);
    }

    function adoptHex(hex: string) {
        const result = parseColor(hex);

        if (result.ok) {
            adopt(result.color);

            return;
        }

        logEvent("warn", "color.swatch_unreadable", { hex });
    }

    function updateOptions(patch: Partial<ColorFormatOptions>) {
        setOptions((current) => ({ ...current, ...patch }));
    }

    function reportCopyFailure(failure: Extract<CopyResult, { ok: false }>) {
        const message =
            failure.reason === "empty"
                ? tToast("copyFailedEmpty")
                : failure.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied");

        toast.error(message);
    }

    async function copyValue(value: string, onCopied: () => void) {
        const copied = await copyText(value);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        onCopied();
        toast.success(tToast("copied", { value }));
    }

    async function handleCopyFormat(row: FormattedColor) {
        await copyValue(row.value, () => markFormatCopied(row.format));
    }

    async function handleCopyStop(stop: ColorScaleStop) {
        await copyValue(stop.hex, () => markStepCopied(stop.step));
    }

    function handleDownload() {
        const exported = createColorExportFile({ color, options, generatedAt: new Date() });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "color.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    function handleSwatchSelect(swatch: ResolvedSwatch | SwatchMatch) {
        adoptHex(swatch.hex);
    }

    return (
        <div className={`flex flex-col gap-6 ${TOOL_ACCENT_VARS.rose}`}>
            <Card className="relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                <span
                    aria-hidden="true"
                    className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
                />

                <CardHeader>
                    <CardTitle className="text-lg">{t("title")}</CardTitle>
                    <CardDescription>{t("description")}</CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-6">
                    <ColorInput
                        value={inputValue}
                        preview={inspection.css}
                        tone={status.tone}
                        message={status.message}
                        onChange={setDraft}
                        onRandom={() => adopt(randomColor())}
                        onPick={adoptHex}
                        onDownload={handleDownload}
                    />

                    <div className="grid gap-6 lg:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-4">
                            <FormatRows
                                rows={inspection.formats}
                                copied={copiedFormat}
                                pending={pending}
                                onCopy={handleCopyFormat}
                            />
                            <ColorOptions options={options} onChange={updateOptions} />
                        </div>

                        <div className="min-w-0">
                            <ColorPicker color={color} onChange={adopt} />
                        </div>
                    </div>

                    <SwatchMatches
                        tailwind={inspection.tailwind}
                        cssName={inspection.cssName}
                        pending={pending}
                        onSelect={handleSwatchSelect}
                    />

                    <Separator />

                    <ContrastPanel report={inspection.contrast} background={inspection.css} />

                    <Separator />

                    <ColorScaleStrip
                        stops={inspection.scale}
                        copied={copiedStep}
                        onCopy={handleCopyStop}
                    />
                </CardContent>
            </Card>

            <PaletteBrowser
                activeHex={formatColor(
                    "hex",
                    { ...color, a: 1 },
                    { ...options, hexCasing: "lower" },
                )}
                onSelect={handleSwatchSelect}
            />
        </div>
    );
}
