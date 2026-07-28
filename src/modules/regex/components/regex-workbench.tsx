"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import {
    MAX_PATTERN_LENGTH,
    MAX_REPLACEMENT_LENGTH,
    MAX_TEST_STRING_LENGTH,
} from "../domain/constants";
import { createRegexExportFile } from "../domain/export";
import { formatFlagLetters, toggleFlag } from "../domain/flags";
import { formatLiteral, type RegexLiteral } from "../domain/literal";
import { buildShareUrl } from "../domain/share";
import type { RegexAnalysis, RegexDelimiter, RegexFailure, RegexFlag, RegexMode } from "../types";
import { ExplanationPanel } from "./explanation-panel";
import { MatchInformation } from "./match-information";
import { ModeSelector } from "./mode-selector";
import { PatternField } from "./pattern-field";
import { RegexStats } from "./regex-stats";
import { ReplacementPanel } from "./replacement-panel";
import { TestStringPanel } from "./test-string-panel";
import { useRegexAnalysis } from "./use-regex-analysis";

type CopyPanel = "pattern" | "output";

const TOOL_PATH = "/tools/regex";

type RegexWorkbenchProps = {
    initialPattern: string;
    initialFlags: readonly RegexFlag[];
    initialDelimiter: RegexDelimiter;
    initialMode: RegexMode;
    initialReplacement: string;
    initialTestString: string;
    /**
     * Computed on the server from exactly these values, so the first paint
     * already carries the result and hydration has nothing to reconcile.
     */
    initialAnalysis: RegexAnalysis;
};

export function RegexWorkbench({
    initialPattern,
    initialFlags,
    initialDelimiter,
    initialMode,
    initialReplacement,
    initialTestString,
    initialAnalysis,
}: RegexWorkbenchProps) {
    const t = useTranslations("regex.workbench");
    const tToast = useTranslations("regex.toast");
    const tErrors = useTranslations("regex.errors");

    const modeLabelId = useId();
    const patternId = useId();
    const testStringId = useId();
    const replacementId = useId();
    const outputId = useId();

    const [pattern, setPattern] = useState(initialPattern);
    const [flags, setFlags] = useState<readonly RegexFlag[]>(initialFlags);
    const [delimiter, setDelimiter] = useState<RegexDelimiter>(initialDelimiter);
    const [mode, setMode] = useState<RegexMode>(initialMode);
    const [replacement, setReplacement] = useState(initialReplacement);
    const [testString, setTestString] = useState(initialTestString);
    const [copied, setCopied] = useCopyFeedback<CopyPanel>();

    // Re-running the engine on every keystroke would re-scan the whole input
    // for each character. The three typed fields settle first; the flags,
    // delimiter, and mode are discrete and apply at once.
    const settledPattern = useDebouncedValue(pattern);
    const settledReplacement = useDebouncedValue(replacement);
    const settledTestString = useDebouncedValue(testString);

    const flagLetters = formatFlagLetters(flags);
    const { analysis, pending: workerPending } = useRegexAnalysis(
        {
            pattern: settledPattern,
            flagLetters,
            mode,
            replacement: settledReplacement,
            testString: settledTestString,
        },
        initialAnalysis,
    );

    const debouncing =
        settledPattern !== pattern ||
        settledReplacement !== replacement ||
        settledTestString !== testString;
    const pending = debouncing || workerPending;

    function describeFailure(failure: RegexFailure): string {
        switch (failure.reason) {
            case "pattern_too_long":
                return tErrors("patternTooLong", { limit: failure.limit ?? MAX_PATTERN_LENGTH });
            case "input_too_long":
                return tErrors("inputTooLong", { limit: failure.limit ?? MAX_TEST_STRING_LENGTH });
            case "replacement_too_long":
                return tErrors("replacementTooLong", {
                    limit: failure.limit ?? MAX_REPLACEMENT_LENGTH,
                });
            case "invalid_pattern":
                return tErrors("invalidPattern", { detail: failure.detail ?? "" });
            case "unsupported_construct":
                return tErrors("unsupportedConstruct", {
                    construct: failure.detail ?? "",
                    // A character offset into the pattern is machine data, so
                    // it keeps Western digits.
                    position: String(failure.position ?? 1),
                });
            case "timed_out":
                return tErrors("timedOut");
        }
    }

    const warning = analysis.diagnostics.find(
        (diagnostic) => diagnostic.code === "nestedQuantifier",
    );

    const status: { tone: StatusTone; message: string } = (() => {
        if (analysis.failure !== null) {
            return { tone: "error", message: describeFailure(analysis.failure) };
        }

        if (pending) {
            return { tone: "pending", message: t("statusWorking") };
        }

        if (warning !== undefined) {
            return {
                tone: "warning",
                message: tErrors("nestedQuantifier", { source: warning.source }),
            };
        }

        if (pattern.length === 0) {
            return { tone: "idle", message: t("statusIdle") };
        }

        return analysis.matches.length > 0
            ? { tone: "success", message: t("statusMatched", { count: analysis.matches.length }) }
            : { tone: "idle", message: t("statusNoMatches") };
    })();

    function handlePasteLiteral(literal: RegexLiteral) {
        setPattern(literal.pattern);
        setFlags(literal.flags);
        setDelimiter(literal.delimiter);
        toast.success(tToast("literalPasted"));
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

    async function copyPanel(panel: CopyPanel, text: string, successMessage: string) {
        const result = await copyText(text);

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        setCopied(panel);
        toast.success(successMessage);
    }

    /**
     * The link carries the live state, not the settled one: a reader who copies
     * mid-keystroke means the pattern they can see, not the one the debounce
     * has caught up to.
     */
    async function handleShare() {
        const link = buildShareUrl({
            path: TOOL_PATH,
            pattern,
            flags,
            mode,
            delimiter,
            replacement,
            testString,
        });

        if (!link.ok) {
            toast.error(tToast("linkTooLong"));

            return;
        }

        const result = await copyText(new URL(link.url, window.location.origin).toString());

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        toast.success(link.omittedTestString ? tToast("linkCopiedTrimmed") : tToast("linkCopied"));
    }

    function handleDownload() {
        const exported = createRegexExportFile({
            mode,
            pattern: settledPattern,
            flagLetters,
            testString: settledTestString,
            analysis,
            generatedAt: new Date(),
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "regex.download_failed", { mode, error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    const blocked = analysis.failure !== null || settledPattern.length === 0;

    return (
        <Card
            className={cn(
                "relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]",
                TOOL_ACCENT_VARS.violet,
            )}
        >
            <span
                aria-hidden="true"
                className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
            />

            <CardHeader>
                <CardTitle className="text-lg">{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <Label id={modeLabelId} className="text-muted-foreground text-xs">
                        {t("modeLabel")}
                    </Label>
                    <ModeSelector value={mode} onChange={setMode} labelId={modeLabelId} />
                </div>

                {/* The explanation and match panels sit beside the workbench on a
                    wide screen and fold underneath it on a narrow one. Both
                    columns need `min-w-0`, or a long unbroken match blows the
                    grid out past the viewport. */}
                <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <div className="flex min-w-0 flex-col gap-4">
                        <PatternField
                            inputId={patternId}
                            pattern={pattern}
                            spans={analysis.highlights}
                            delimiter={delimiter}
                            flags={flags}
                            invalid={analysis.failure !== null}
                            copied={copied === "pattern"}
                            stats={
                                <RegexStats
                                    matchCount={analysis.matches.length}
                                    groupCount={analysis.groups.length}
                                    durationMs={analysis.durationMs}
                                    truncated={analysis.truncated}
                                    pending={pending}
                                />
                            }
                            onPatternChange={setPattern}
                            onPasteLiteral={handlePasteLiteral}
                            onDelimiterChange={setDelimiter}
                            onToggleFlag={(flag) =>
                                setFlags((current) => toggleFlag(current, flag))
                            }
                            onCopy={() =>
                                copyPanel(
                                    "pattern",
                                    formatLiteral(pattern, flags, delimiter),
                                    tToast("patternCopied"),
                                )
                            }
                        />

                        <StatusStrip tone={status.tone} message={status.message} />

                        <TestStringPanel
                            inputId={testStringId}
                            value={testString}
                            matches={analysis.matches}
                            pending={pending}
                            blocked={blocked}
                            onChange={setTestString}
                            onClear={() => setTestString("")}
                            onShare={handleShare}
                            onDownload={handleDownload}
                        />

                        {mode !== "match" && (
                            <ReplacementPanel
                                mode={mode}
                                replacementId={replacementId}
                                outputId={outputId}
                                replacement={replacement}
                                output={analysis.output}
                                pending={pending}
                                onReplacementChange={setReplacement}
                                onCopy={() =>
                                    copyPanel("output", analysis.output, tToast("outputCopied"))
                                }
                            />
                        )}
                    </div>

                    <div className="flex min-w-0 flex-col gap-3">
                        <ExplanationPanel nodes={analysis.explanation} pending={pending} />
                        <MatchInformation
                            matches={analysis.matches}
                            truncated={analysis.truncated}
                            blocked={blocked}
                            pending={pending}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
