"use client";

import {
    IconArrowsUpDown,
    IconClipboardCheck,
    IconCode,
    IconDownload,
    IconWand,
    IconX,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import {
    DEFAULT_CODE_OPTIONS,
    DEFAULT_CURL_OPTIONS,
    MAX_CURL_INPUT_LENGTH,
    SAMPLE_CURL,
    SAMPLE_FETCH,
} from "../domain/constants";
import { convert } from "../domain/convert";
import type { HighlightLanguage } from "@/modules/tools/domain/highlight";
import { buildRequestJson, createCurlExportFile } from "../domain/export";
import type {
    CodeOptions,
    CodeTarget,
    ConversionResult,
    CurlDirection,
    CurlOptions,
    FetchRuntime,
    CodeStyle,
    ShellDialect,
} from "../types";
import { CURL_DIRECTIONS } from "../types";
import { CodeBlock } from "@/modules/tools/components/code-block";
import { CodeEditor } from "@/modules/tools/components/code-editor";
import { ConversionOptions } from "./conversion-options";
import { NotesList } from "./notes-list";
import { RequestPanel } from "./request-panel";

type CurlWorkbenchProps = {
    initialDirection: CurlDirection;
    initialInput: string;
    initialTarget: CodeTarget;
    initialRuntime: FetchRuntime;
    initialStyle: CodeStyle;
    initialShell: ShellDialect;
};

export function CurlWorkbench({
    initialDirection,
    initialInput,
    initialTarget,
    initialRuntime,
    initialStyle,
    initialShell,
}: CurlWorkbenchProps) {
    const t = useTranslations("curl.workbench");
    const tDirections = useTranslations("curl.directions");
    const tShells = useTranslations("curl.shells");
    const tErrors = useTranslations("curl.errors");
    const tToast = useTranslations("curl.toast");
    const tRequest = useTranslations("curl.request");

    const inputId = useId();
    const statusId = useId();

    const [direction, setDirection] = useState<CurlDirection>(initialDirection);
    const [input, setInput] = useState(initialInput);
    const [code, setCode] = useState<CodeOptions>({
        ...DEFAULT_CODE_OPTIONS,
        target: initialTarget,
        runtime: initialRuntime,
        style: initialStyle,
    });
    const [curl, setCurl] = useState<CurlOptions>({
        ...DEFAULT_CURL_OPTIONS,
        shell: initialShell,
    });

    // Reading a command is a tokenise and a walk over a hundred-odd flags, and
    // writing it back builds a whole snippet — worth settling before running on
    // every keystroke. The option controls are discrete, so they stay instant.
    const settled = useDebouncedValue(input);
    const pending = settled !== input;

    // Pure and deterministic, so the server-rendered pass already carries the
    // result and hydration has nothing to reconcile.
    const result = convert({ direction, input: settled, code, curl });
    const output = result.ok ? result.output : "";

    // The two boxes always hold opposite languages, so one flag decides both.
    const inputLanguage: HighlightLanguage = direction === "curlToCode" ? "shell" : "javascript";
    const outputLanguage: HighlightLanguage = direction === "curlToCode" ? "javascript" : "shell";

    function describeFailure(failure: Extract<ConversionResult, { ok: false }>): string | null {
        switch (failure.reason) {
            case "empty":
                return null;
            case "too_long":
                return tErrors("tooLong", { max: MAX_CURL_INPUT_LENGTH });
            case "not_curl":
                return tErrors("notCurl");
            case "unbalanced_quote":
                return tErrors("unbalancedQuote");
            case "missing_value":
                return tErrors("missingValue", { token: failure.token ?? "" });
            case "no_url":
                return tErrors("noUrl");
            case "invalid_url":
                return tErrors("invalidUrl");
            case "no_request_call":
                return tErrors("noRequestCall");
            case "unsupported_expression":
                return tErrors("unsupportedExpression");
        }
    }

    const failure = result.ok ? null : describeFailure(result);
    const status: { tone: StatusTone; message: string } = result.ok
        ? { tone: "success", message: t("statusReady", { notes: result.notes.length }) }
        : failure === null
          ? { tone: "idle", message: t("statusEmpty") }
          : { tone: "error", message: failure };

    /**
     * Only `fetch` is read back, so the output is re-usable as input in exactly
     * two cases. Offering the button otherwise would hand the reader an axios
     * snippet and then refuse to parse it.
     */
    const swappable = output.length > 0 && (direction === "codeToCurl" || code.target === "fetch");

    function handleSwap() {
        if (!swappable) {
            return;
        }

        setInput(output);
        setDirection(direction === "curlToCode" ? "codeToCurl" : "curlToCode");
    }

    function handleExample() {
        setInput(direction === "curlToCode" ? SAMPLE_CURL : SAMPLE_FETCH);
    }

    function reportCopyFailure(caught: Extract<CopyResult, { ok: false }>) {
        const message =
            caught.reason === "empty"
                ? tToast("copyFailedEmpty")
                : caught.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied");

        toast.error(message);
    }

    async function copyValue(text: string, message: string) {
        const copied = await copyText(text);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        toast.success(message);
    }

    function handleDownload() {
        const exported = createCurlExportFile({
            direction,
            target: code.target,
            content: output,
            generatedAt: new Date(),
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "curl.download_failed", {
                direction,
                target: code.target,
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

            <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <Label className="text-muted-foreground text-xs">
                        <span className="leading-[1.3]">{t("directionLabel")}</span>
                    </Label>
                    <Tabs
                        value={direction}
                        onValueChange={(next) => {
                            if (next !== null) {
                                setDirection(next as CurlDirection);
                            }
                        }}
                    >
                        <TabsList className="w-full max-w-80">
                            {CURL_DIRECTIONS.map((value) => (
                                <TabsTrigger key={value} value={value}>
                                    {tDirections(value)}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">
                                {direction === "curlToCode"
                                    ? t("inputLabelCurl")
                                    : t("inputLabelCode")}
                            </span>
                        </Label>
                        <div className="flex items-center gap-1.5">
                            <Button variant="ghost" size="sm" onClick={handleExample}>
                                <IconWand className="size-3.5" stroke={1.8} aria-hidden="true" />
                                {t("example")}
                            </Button>
                            <button
                                type="button"
                                onClick={() => setInput("")}
                                disabled={input.length === 0}
                                aria-label={t("clear")}
                                className={cn(
                                    buttonVariants({ variant: "ghost", size: "icon-sm" }),
                                    "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <IconX className="size-4" stroke={1.9} aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    <CodeEditor
                        id={inputId}
                        value={input}
                        language={inputLanguage}
                        placeholder={
                            direction === "curlToCode" ? t("placeholderCurl") : t("placeholderCode")
                        }
                        ariaDescribedBy={statusId}
                        onChange={setInput}
                    />

                    <StatusStrip
                        id={statusId}
                        tone={status.tone}
                        message={status.message}
                        className="[&>span]:min-w-0 [&>span]:wrap-break-word"
                    />

                    {result.ok && result.detectedShell !== null && (
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("detected", { shell: tShells(result.detectedShell) })}
                        </p>
                    )}
                </div>

                <ConversionOptions
                    direction={direction}
                    code={code}
                    curl={curl}
                    onCodeChange={(patch) => setCode((current) => ({ ...current, ...patch }))}
                    onCurlChange={(patch) => setCurl((current) => ({ ...current, ...patch }))}
                />

                <div className="flex items-center gap-3">
                    <Separator className="flex-1" />
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <button
                                    type="button"
                                    onClick={handleSwap}
                                    disabled={!swappable}
                                    aria-label={t("swap")}
                                    className={cn(
                                        buttonVariants({ variant: "outline", size: "icon-sm" }),
                                        "rounded-full",
                                    )}
                                />
                            }
                        >
                            <IconArrowsUpDown className="size-4" stroke={1.8} aria-hidden="true" />
                        </TooltipTrigger>
                        <TooltipContent side="top">{t("swap")}</TooltipContent>
                    </Tooltip>
                    <Separator className="flex-1" />
                </div>

                <Tabs defaultValue="output">
                    <TabsList className="w-full max-w-64">
                        <TabsTrigger value="output">{t("tabs.output")}</TabsTrigger>
                        <TabsTrigger value="request">{t("tabs.request")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="output" className="flex flex-col gap-3 pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-muted-foreground text-xs">
                                {t("outputLabel")}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => copyValue(output, tToast("copied"))}
                                    disabled={output.length === 0}
                                >
                                    <IconClipboardCheck
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("copy")}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDownload}
                                    disabled={output.length === 0}
                                >
                                    <IconDownload
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("download")}
                                </Button>
                            </div>
                        </div>

                        <CodeBlock
                            code={output}
                            language={outputLanguage}
                            placeholder={t("outputPlaceholder")}
                            pending={pending}
                            className="max-h-96"
                        />

                        {result.ok && <NotesList notes={result.notes} />}
                    </TabsContent>

                    <TabsContent value="request" className="flex flex-col gap-3 pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-muted-foreground text-xs">
                                {tRequest("description")}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!result.ok}
                                onClick={() =>
                                    result.ok
                                        ? copyValue(
                                              buildRequestJson(result.request),
                                              tToast("copiedRequest"),
                                          )
                                        : undefined
                                }
                            >
                                <IconCode className="size-3.5" stroke={1.8} aria-hidden="true" />
                                {t("copy")}
                            </Button>
                        </div>

                        <div
                            className={cn(
                                "transition-opacity duration-200",
                                pending && "opacity-55",
                            )}
                        >
                            <RequestPanel request={result.ok ? result.request : null} />
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
