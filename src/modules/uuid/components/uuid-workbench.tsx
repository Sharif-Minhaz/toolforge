"use client";

import {
    IconClipboardCheck,
    IconDownload,
    IconFileTypeCsv,
    IconFileTypeTxt,
    IconJson,
    IconRefresh,
} from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { MOTION_EASE } from "@/components/motion/motion-tokens";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { LIVE_UPDATE_DEBOUNCE_MS } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { RESULT_TRAY, StepLabel } from "@/modules/tools/components/workbench-step";
import { MAX_UUID_QUANTITY, MIN_UUID_QUANTITY } from "../domain/constants";
import { createExportFile } from "../domain/export";
import { generateUuids, isValidQuantity } from "../domain/generate";
import { UUID_EXPORT_FORMATS, type UuidExportFormat, type UuidVersion } from "../types";
import { QuantityControl } from "./quantity-control";
import { UuidResults } from "./uuid-results";
import { VersionSelector } from "./version-selector";

const FORMAT_ICONS = {
    txt: IconFileTypeTxt,
    csv: IconFileTypeCsv,
    json: IconJson,
} as const satisfies Record<UuidExportFormat, unknown>;

const COPY_FEEDBACK_MS = 1600;

type UuidWorkbenchProps = {
    /** Generated on the server so the first paint already shows a result. */
    initialUuids: readonly string[];
    initialVersion: UuidVersion;
    initialQuantity: number;
};

export function UuidWorkbench({
    initialUuids,
    initialVersion,
    initialQuantity,
}: UuidWorkbenchProps) {
    const t = useTranslations("uuid.generator");
    const tToast = useTranslations("uuid.toast");
    const tErrors = useTranslations("uuid.errors");
    const format = useFormatter();
    const reduceMotion = useReducedMotion();

    const versionLabelId = useId();
    const quantityInputId = useId();
    const quantityHintId = useId();

    const [version, setVersion] = useState<UuidVersion>(initialVersion);
    const [quantity, setQuantity] = useState(initialQuantity);
    const [quantityInput, setQuantityInput] = useState(String(initialQuantity));
    const [uuids, setUuids] = useState<readonly string[]>(initialUuids);
    const [generationId, setGenerationId] = useState(0);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [spinToken, setSpinToken] = useState(0);
    const regenerateTimer = useRef<number | null>(null);

    const quantityInvalid = !isValidQuantity(Number.parseInt(quantityInput, 10));

    useEffect(() => {
        if (copiedIndex === null) {
            return;
        }

        const timer = window.setTimeout(() => setCopiedIndex(null), COPY_FEEDBACK_MS);

        return () => window.clearTimeout(timer);
    }, [copiedIndex]);

    const regenerate = useCallback(
        (nextVersion: UuidVersion, nextQuantity: number) => {
            try {
                setUuids(generateUuids({ version: nextVersion, quantity: nextQuantity }));
                setGenerationId((current) => current + 1);
                setCopiedIndex(null);
            } catch (error) {
                logEvent("error", "uuid.generation_failed", {
                    version: nextVersion,
                    quantity: nextQuantity,
                    error: describeError(error),
                });
                toast.error(tErrors("generic"));
            }
        },
        [tErrors],
    );

    const cancelScheduled = useCallback(() => {
        if (regenerateTimer.current === null) {
            return;
        }

        window.clearTimeout(regenerateTimer.current);
        regenerateTimer.current = null;
    }, []);

    useEffect(() => cancelScheduled, [cancelScheduled]);

    function handleVersionChange(next: UuidVersion) {
        setVersion(next);
        cancelScheduled();

        if (!quantityInvalid) {
            regenerate(next, quantity);
        }
    }

    /**
     * `immediate` separates a deliberate choice — a preset, a step, the button
     * — from typing, where every keystroke would otherwise mint and render a
     * whole batch on the way to the number the user actually wants.
     */
    function applyQuantity(raw: string, immediate: boolean) {
        // 500 is the ceiling, so three digits is all the field ever needs.
        const sanitized = raw.replace(/\D/g, "").slice(0, 3);
        setQuantityInput(sanitized);
        cancelScheduled();

        const parsed = Number.parseInt(sanitized, 10);

        if (!isValidQuantity(parsed)) {
            return;
        }

        setQuantity(parsed);

        if (immediate) {
            regenerate(version, parsed);

            return;
        }

        regenerateTimer.current = window.setTimeout(() => {
            regenerateTimer.current = null;
            regenerate(version, parsed);
        }, LIVE_UPDATE_DEBOUNCE_MS);
    }

    function handleStep(delta: number) {
        const next = Math.min(MAX_UUID_QUANTITY, Math.max(MIN_UUID_QUANTITY, quantity + delta));
        applyQuantity(String(next), true);
    }

    function handleRegenerate() {
        if (quantityInvalid) {
            return;
        }

        cancelScheduled();
        setSpinToken((current) => current + 1);
        regenerate(version, quantity);
        toast.success(tToast("generated", { count: quantity }));
    }

    function reportCopyFailure(result: Extract<CopyResult, { ok: false }>) {
        const message =
            result.reason === "empty"
                ? tToast("copyFailedEmpty")
                : result.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied");

        toast.error(message);
    }

    async function handleCopyOne(uuid: string, index: number) {
        const result = await copyText(uuid);

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        setCopiedIndex(index);
        toast.success(tToast("copiedSingle"));
    }

    async function handleCopyAll() {
        const result = await copyText(uuids.join("\n"));

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        toast.success(tToast("copiedAll", { count: uuids.length }));
    }

    function handleDownload(format: UuidExportFormat) {
        const file = createExportFile({ uuids, version, format, generatedAt: new Date() });

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (error) {
            logEvent("error", "uuid.download_failed", {
                format,
                error: describeError(error),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-col gap-6">
                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                    <div className="flex flex-col gap-2">
                        <StepLabel step={1} id={versionLabelId}>
                            {t("versionLabel")}
                        </StepLabel>
                        <VersionSelector
                            value={version}
                            onChange={handleVersionChange}
                            labelId={versionLabelId}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor={quantityInputId} className="text-muted-foreground text-xs">
                            {t("quantityLabel")}
                        </Label>
                        <QuantityControl
                            value={quantityInput}
                            quantity={quantity}
                            onChange={(raw) => applyQuantity(raw, false)}
                            onPreset={(preset) => applyQuantity(String(preset), true)}
                            onStep={handleStep}
                            invalid={quantityInvalid}
                            inputId={quantityInputId}
                            describedById={quantityHintId}
                        />
                    </div>
                </div>

                <div className={RESULT_TRAY}>
                    <StepLabel step={2}>{t("resultsLabel")}</StepLabel>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            onClick={handleRegenerate}
                            disabled={quantityInvalid}
                            className="h-9 px-3.5"
                        >
                            <motion.span
                                key={spinToken}
                                initial={reduceMotion ? false : { rotate: -180 }}
                                animate={{ rotate: 0 }}
                                transition={{ duration: 0.32, ease: MOTION_EASE }}
                                className="grid place-items-center"
                            >
                                <IconRefresh className="size-4" stroke={1.9} aria-hidden="true" />
                            </motion.span>
                            {t("regenerate")}
                        </Button>

                        <Button
                            variant="outline"
                            onClick={handleCopyAll}
                            disabled={uuids.length === 0}
                            className="h-9 px-3.5"
                        >
                            <IconClipboardCheck
                                className="size-4"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {t("copyAll")}
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button
                                        variant="outline"
                                        disabled={uuids.length === 0}
                                        className="h-9 px-3.5"
                                    />
                                }
                            >
                                <IconDownload className="size-4" stroke={1.8} aria-hidden="true" />
                                {t("download")}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="min-w-44">
                                {UUID_EXPORT_FORMATS.map((format) => {
                                    const Icon = FORMAT_ICONS[format];

                                    return (
                                        <DropdownMenuItem
                                            key={format}
                                            onClick={() => handleDownload(format)}
                                        >
                                            <Icon
                                                className="size-4"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                            {t("downloadAs", { format: format.toUpperCase() })}
                                        </DropdownMenuItem>
                                    );
                                })}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <span
                            className={cn(
                                "text-muted-foreground ml-auto font-mono text-xs tabular-nums",
                                "hidden sm:inline",
                            )}
                        >
                            {format.number(uuids.length)}
                        </span>
                    </div>

                    <UuidResults
                        uuids={uuids}
                        generationId={generationId}
                        copiedIndex={copiedIndex}
                        onCopy={handleCopyOne}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
