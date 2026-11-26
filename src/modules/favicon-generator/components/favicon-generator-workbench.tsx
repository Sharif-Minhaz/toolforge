"use client";

import { IconDownload, IconLoader2 } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { ColorField } from "@/modules/tools/components/color-field";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import {
    OptionsDisclosure,
    RESULT_TRAY,
    StepLabel,
} from "@/modules/tools/components/workbench-step";
import { buildZipArchive } from "@/modules/tools/domain/archive";
import { copyText } from "@/modules/tools/domain/clipboard";
import { buildFaviconHeadHtml } from "@/modules/tools/domain/favicon";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { MAX_APP_NAME_LENGTH, MAX_TEXT_LENGTH, PACK_FILENAME } from "../domain/constants";
import { checkFaviconOptions, needsBackground, resolveAppName } from "../domain/options";
import { buildFaviconPack } from "../domain/pack";
import {
    FAVICON_FONTS,
    FAVICON_SHAPES,
    type FaviconFailureReason,
    type FaviconFont,
    type FaviconOptions,
    type FaviconShape,
} from "../types";
import { FaviconPreviews } from "./favicon-previews";
import { loadGlyphFont, resolveFontStack } from "./glyph-font";

const SNIPPET_KEY = "snippet";

type FaviconGeneratorWorkbenchProps = {
    initialOptions: FaviconOptions;
};

export function FaviconGeneratorWorkbench({ initialOptions }: FaviconGeneratorWorkbenchProps) {
    const t = useTranslations("faviconGenerator.workbench");
    const tFonts = useTranslations("faviconGenerator.fonts");
    const tShapes = useTranslations("faviconGenerator.shapes");
    const tErrors = useTranslations("faviconGenerator.errors");
    const tToast = useTranslations("faviconGenerator.toast");

    const textId = useId();
    const appNameId = useId();
    const resultId = useId();

    const [options, setOptions] = useState(initialOptions);
    const [packing, setPacking] = useState(false);
    // Only drawing can tell that a font has no ink for the text, so this one
    // arrives from the press rather than from the options.
    const [packFailure, setPackFailure] = useState<FaviconFailureReason | null>(null);
    const [copied, markCopied] = useCopyFeedback<typeof SNIPPET_KEY>();

    const textLimit = useInputLimit(options.text.length, MAX_TEXT_LENGTH);
    const appNameLimit = useInputLimit(options.appName.length, MAX_APP_NAME_LENGTH);

    const failures = checkFaviconOptions(options);
    const textFailure = failures.includes("empty_text") ? "empty_text" : packFailure;
    const colorFailures = failures.filter((reason) => reason !== "empty_text");
    const opaque = needsBackground(options);
    const snippet = buildFaviconHeadHtml();

    function patch(next: Partial<FaviconOptions>) {
        setOptions((current) => ({ ...current, ...next }));
        setPackFailure(null);
    }

    async function handleDownload() {
        setPacking(true);

        try {
            const stack = resolveFontStack(options.font);

            await loadGlyphFont(stack, options.bold, options.text);

            const outcome = await buildFaviconPack(options, stack);

            if (!outcome.ok) {
                setPackFailure(outcome.reason);

                return;
            }

            const entries = await Promise.all(
                outcome.files.map(async (file) => ({
                    name: file.name,
                    bytes: new Uint8Array(await file.blob.arrayBuffer()),
                })),
            );

            saveBlob({
                filename: PACK_FILENAME,
                blob: new Blob([buildZipArchive(entries, new Date())], {
                    type: "application/zip",
                }),
            });
            toast.success(tToast("downloaded", { filename: PACK_FILENAME }));
        } catch (caught) {
            logEvent("error", "favicon_generator.pack_failed", { error: describeError(caught) });
            toast.error(tToast("packFailed"));
        } finally {
            setPacking(false);
        }
    }

    async function handleCopySnippet() {
        const result = await copyText(snippet);

        if (result.ok) {
            markCopied(SNIPPET_KEY);
            toast.success(tToast("snippetCopied"));

            return;
        }

        logEvent("error", "favicon_generator.snippet_copy_failed", { reason: result.reason });
        toast.error(tToast("snippetCopyFailed"));
    }

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-4">
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <StepLabel step={1} htmlFor={textId}>
                                {t("textLabel")}
                            </StepLabel>
                            <InputLimitMeter reading={textLimit} />
                        </div>
                        <Input
                            id={textId}
                            maxLength={MAX_TEXT_LENGTH}
                            value={options.text}
                            onChange={(event) => patch({ text: event.target.value })}
                            aria-invalid={textFailure !== null}
                            spellCheck={false}
                            autoComplete="off"
                            className="text-base"
                        />
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("textHint")}
                        </p>
                        {textFailure !== null && (
                            <StatusStrip tone="error" message={tErrors(textFailure)} />
                        )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <OptionSelect<FaviconFont>
                            label={t("fontLabel")}
                            hint={options.font === "serif" ? t("fontSerifHint") : t("fontHint")}
                            value={options.font}
                            values={FAVICON_FONTS}
                            items={Object.fromEntries(
                                FAVICON_FONTS.map((value) => [value, tFonts(value)]),
                            )}
                            onChange={(font) => patch({ font })}
                        />
                        <OptionSelect<FaviconShape>
                            label={t("shapeLabel")}
                            // The shape is the background plate's outline; with
                            // no plate the choice is locked rather than ignored.
                            hint={opaque ? t("shapeHint") : t("needsBackground")}
                            value={options.shape}
                            values={FAVICON_SHAPES}
                            disabled={!opaque}
                            items={Object.fromEntries(
                                FAVICON_SHAPES.map((value) => [value, tShapes(value)]),
                            )}
                            onChange={(shape) => patch({ shape })}
                        />
                    </div>

                    <OptionSwitch
                        label={t("boldLabel")}
                        hint={t("boldHint")}
                        checked={options.bold}
                        onCheckedChange={(bold) => patch({ bold })}
                    />

                    <div className="flex flex-col gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <ColorField
                                label={t("foreground")}
                                value={options.foreground}
                                onChange={(foreground) => patch({ foreground })}
                            />
                            <ColorField
                                label={t("background")}
                                value={options.background}
                                disabled={options.transparent}
                                onChange={(background) => patch({ background })}
                            />
                        </div>
                        {colorFailures.map((reason) => (
                            <StatusStrip key={reason} tone="error" message={tErrors(reason)} />
                        ))}
                        <OptionSwitch
                            label={t("transparentLabel")}
                            hint={t("transparentHint")}
                            checked={options.transparent}
                            onCheckedChange={(transparent) => patch({ transparent })}
                        />
                    </div>

                    <OptionsDisclosure label={t("webAppTitle")}>
                        <div className="flex flex-col gap-4">
                            <OptionSwitch
                                label={t("maskableLabel")}
                                hint={opaque ? t("maskableHint") : t("needsBackground")}
                                checked={options.maskable && opaque}
                                disabled={!opaque}
                                onCheckedChange={(maskable) => patch({ maskable })}
                            />
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Label
                                        htmlFor={appNameId}
                                        className="text-muted-foreground text-xs"
                                    >
                                        <span className="leading-[1.3]">{t("appNameLabel")}</span>
                                    </Label>
                                    <InputLimitMeter reading={appNameLimit} />
                                </div>
                                <Input
                                    id={appNameId}
                                    maxLength={MAX_APP_NAME_LENGTH}
                                    value={options.appName}
                                    placeholder={resolveAppName({
                                        appName: "",
                                        text: options.text,
                                    })}
                                    onChange={(event) => patch({ appName: event.target.value })}
                                    autoComplete="off"
                                />
                                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {t("appNameHint")}
                                </p>
                            </div>
                        </div>
                    </OptionsDisclosure>
                </div>

                <section aria-labelledby={resultId} className={RESULT_TRAY}>
                    <StepLabel step={2} id={resultId}>
                        {t("resultTitle")}
                    </StepLabel>

                    <div className="bg-card ring-border/70 rounded-lg p-4 ring-1 ring-inset">
                        <FaviconPreviews options={options} stale={failures.length > 0} />
                    </div>

                    <Button
                        type="button"
                        className="self-start"
                        disabled={failures.length > 0 || packing}
                        onClick={() => void handleDownload()}
                    >
                        {packing ? (
                            <IconLoader2
                                className="size-4 animate-spin"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                        ) : (
                            <IconDownload className="size-4" stroke={1.8} aria-hidden="true" />
                        )}
                        {packing ? t("packing") : t("download")}
                    </Button>

                    <div className="bg-card ring-border/70 flex min-w-0 flex-col gap-2 rounded-lg px-3 py-2.5 ring-1 ring-inset">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                            <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-[0.8125rem] leading-[1.3] font-medium">
                                    {t("snippetTitle")}
                                </span>
                                <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {t("snippetDescription")}
                                </span>
                            </span>
                            <IconCopyButton
                                copied={copied === SNIPPET_KEY}
                                aria-label={t("snippetCopy")}
                                onClick={() => void handleCopySnippet()}
                            />
                        </div>
                        <pre className="min-w-0 overflow-x-auto font-mono text-[0.6875rem] leading-[1.6]">
                            <code>{snippet.trimEnd()}</code>
                        </pre>
                    </div>
                </section>
            </CardContent>
        </Card>
    );
}
