"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { compareHash } from "../domain/compare";
import { MAX_BCRYPT_COST, MAX_HASH_INPUT_LENGTH, MIN_BCRYPT_COST } from "../domain/constants";
import { detectHash } from "../domain/detect";
import { createHashExportFile } from "../domain/export";
import { hashText } from "../domain/hash";
import { createSaltSeed } from "../domain/salt";
import type { CompareResult, HashAlgorithm, HashMode, HashOptions, HashResult } from "../types";
import { AlgorithmSelect } from "./algorithm-select";
import { ComparePanel } from "./compare-panel";
import { GeneratePanel } from "./generate-panel";
import { HashOptionsPanel } from "./hash-options";
import { ModeSelector } from "./mode-selector";

type CopyPanel = "output" | "left" | "right";

type HashWorkbenchProps = {
    initialMode: HashMode;
    initialOptions: HashOptions;
    initialText: string;
    /**
     * Drawn on the server. Salts are random, so generating one in a `useState`
     * initialiser would give the server pass and the client different bytes and
     * break hydration.
     */
    initialSaltSeed: string;
};

export function HashWorkbench({
    initialMode,
    initialOptions,
    initialText,
    initialSaltSeed,
}: HashWorkbenchProps) {
    const t = useTranslations("hash.workbench");
    const tGenerateErrors = useTranslations("hash.errors.generate");
    const tCompareErrors = useTranslations("hash.errors.compare");
    const tToast = useTranslations("hash.toast");

    const modeLabelId = useId();
    const algorithmLabelId = useId();

    const [mode, setMode] = useState<HashMode>(initialMode);
    const [options, setOptions] = useState<HashOptions>(initialOptions);
    const [text, setText] = useState(initialText);
    const [saltSeed, setSaltSeed] = useState(initialSaltSeed);
    const [left, setLeft] = useState("");
    const [right, setRight] = useState("");
    const [copied, setCopied] = useCopyFeedback<CopyPanel>();

    const [hashed, setHashed] = useState<{ key: string; result: HashResult } | null>(null);
    const [compared, setCompared] = useState<{ key: string; result: CompareResult } | null>(null);

    // Typed values settle first: bcrypt at cost 10 is ~60ms of blocked main
    // thread, and running that per keystroke is felt immediately. Every other
    // control — steppers, presets, the algorithm menu — is discrete and applies
    // at once.
    const settledText = useDebouncedValue(text);
    const settledLeft = useDebouncedValue(left);
    const settledRight = useDebouncedValue(right);

    const generatePending = settledText !== text;
    const comparePending = settledLeft !== left || settledRight !== right;

    const hashKey = JSON.stringify([settledText, options, saltSeed]);
    const compareKey = JSON.stringify([settledLeft, settledRight]);

    useEffect(() => {
        if (mode !== "generate") {
            return;
        }

        let cancelled = false;

        void hashText({ text: settledText, options, saltSeed }).then((result) => {
            if (!cancelled) {
                setHashed({ key: hashKey, result });
            }
        });

        return () => {
            cancelled = true;
        };
    }, [mode, hashKey, settledText, options, saltSeed]);

    useEffect(() => {
        if (mode !== "compare") {
            return;
        }

        let cancelled = false;

        void compareHash({ left: settledLeft, right: settledRight }).then((result) => {
            if (!cancelled) {
                setCompared({ key: compareKey, result });
            }
        });

        return () => {
            cancelled = true;
        };
    }, [mode, compareKey, settledLeft, settledRight]);

    // A result from an earlier keystroke is discarded rather than shown: the
    // panel dims and says "hashing" instead of asserting a stale value.
    const hashResult = hashed?.key === hashKey ? hashed.result : null;
    const compareResult = compared?.key === compareKey ? compared.result : null;
    const detected = detectHash(right);

    function describeHashFailure(failure: Extract<HashResult, { ok: false }>): string {
        switch (failure.reason) {
            case "too_large":
                return tGenerateErrors("too_large", { limit: MAX_HASH_INPUT_LENGTH });
            case "password_too_long":
                return tGenerateErrors("password_too_long", { bytes: failure.bytes ?? 0 });
            case "invalid_cost":
                return tGenerateErrors("invalid_cost", {
                    min: MIN_BCRYPT_COST,
                    max: MAX_BCRYPT_COST,
                });
            default:
                return tGenerateErrors(failure.reason);
        }
    }

    function describeCompareFailure(failure: Extract<CompareResult, { ok: false }>): string {
        return failure.reason === "too_large"
            ? tCompareErrors("too_large", { limit: MAX_HASH_INPUT_LENGTH })
            : tCompareErrors(failure.reason);
    }

    function updateOptions(patch: Partial<HashOptions>) {
        setOptions((current) => ({ ...current, ...patch }));
    }

    function handleAlgorithmChange(algorithm: HashAlgorithm) {
        updateOptions({ algorithm });
        // Switching family changes what the salt is for, so it is redrawn
        // rather than carried across.
        setSaltSeed(createSaltSeed());
    }

    function handleNewSalt() {
        setSaltSeed(createSaltSeed());
        toast.success(tToast("saltRegenerated"));
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

    async function handleCopy(panel: CopyPanel, value: string) {
        const result = await copyText(value);

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        setCopied(panel);
        toast.success(tToast("copied"));
    }

    function handleDownload() {
        const content = hashResult?.ok === true ? hashResult.hash : "";
        const file = createHashExportFile({ mode: "generate", content, generatedAt: new Date() });

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (caught) {
            logEvent("error", "hash.download_failed", {
                algorithm: options.algorithm,
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    return (
        <Card className="relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <span
                aria-hidden="true"
                className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
            />

            <CardHeader>
                <CardTitle className="text-lg">{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-col gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-2">
                        <Label id={modeLabelId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("modeLabel")}</span>
                        </Label>
                        <ModeSelector value={mode} onChange={setMode} labelId={modeLabelId} />
                    </div>

                    {mode === "generate" && (
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label id={algorithmLabelId} className="text-muted-foreground text-xs">
                                <span className="leading-[1.3]">{t("algorithmLabel")}</span>
                            </Label>
                            <AlgorithmSelect
                                value={options.algorithm}
                                onChange={handleAlgorithmChange}
                                labelledBy={algorithmLabelId}
                                className="w-full"
                            />
                            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {t("algorithmHint")}
                            </p>
                        </div>
                    )}
                </div>

                {mode === "generate" ? (
                    <>
                        <HashOptionsPanel options={options} onChange={updateOptions} />
                        <GeneratePanel
                            algorithm={options.algorithm}
                            text={text}
                            onTextChange={setText}
                            onClear={() => setText("")}
                            onNewSalt={handleNewSalt}
                            result={hashResult}
                            pending={generatePending}
                            copied={copied === "output"}
                            onCopy={() =>
                                void handleCopy(
                                    "output",
                                    hashResult?.ok === true ? hashResult.hash : "",
                                )
                            }
                            onDownload={handleDownload}
                            describeFailure={describeHashFailure}
                        />
                    </>
                ) : (
                    <ComparePanel
                        left={left}
                        right={right}
                        onLeftChange={setLeft}
                        onRightChange={setRight}
                        onClear={() => {
                            setLeft("");
                            setRight("");
                        }}
                        detected={detected}
                        result={compareResult}
                        pending={comparePending}
                        copied={copied === "output" ? null : copied}
                        onCopy={(panel, value) => void handleCopy(panel, value)}
                        describeFailure={describeCompareFailure}
                    />
                )}
            </CardContent>
        </Card>
    );
}
