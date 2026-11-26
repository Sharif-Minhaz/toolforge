"use client";

import {
    IconArrowsLeftRight,
    IconArrowsUpDown,
    IconClipboardCheck,
    IconDownload,
    IconWand,
    IconX,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { CodeBlock } from "@/modules/tools/components/code-block";
import { CodeEditor } from "@/modules/tools/components/code-editor";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { RESULT_TRAY, StepLabel } from "@/modules/tools/components/workbench-step";
import { copyText } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import type { HighlightLanguage } from "@/modules/tools/domain/highlight";
import { MAX_INPUT_LENGTH, SAMPLE_COMPOSE, SAMPLE_RUN } from "../domain/constants";
import { convert } from "../domain/convert";
import { createDockerComposeExportFile } from "../domain/export";
import {
    DOCKER_COMPOSE_DIRECTIONS,
    type ConversionResult,
    type DockerComposeDirection,
} from "../types";
import { NotesList } from "./notes-list";

type DockerComposeWorkbenchProps = {
    initialDirection: DockerComposeDirection;
    initialInput: string;
};

const SAMPLES: Record<DockerComposeDirection, string> = {
    runToCompose: SAMPLE_RUN,
    composeToRun: SAMPLE_COMPOSE,
};

/**
 * TOON's line grammar — `key:`, `- item`, `# comment` — is YAML's block
 * subset, so its highlighter colours a compose file without a second one.
 */
const LANGUAGE: Record<"run" | "compose", HighlightLanguage> = { run: "shell", compose: "toon" };

export function DockerComposeWorkbench({
    initialDirection,
    initialInput,
}: DockerComposeWorkbenchProps) {
    const t = useTranslations("dockerCompose.workbench");
    const tDirections = useTranslations("dockerCompose.directions");
    const tErrors = useTranslations("dockerCompose.errors");
    const tToast = useTranslations("dockerCompose.toast");

    const inputId = useId();
    const statusId = useId();

    const [direction, setDirection] = useState<DockerComposeDirection>(initialDirection);
    const [input, setInput] = useState(initialInput);

    // Tokenising every command, or parsing a whole YAML document, is worth
    // settling before it runs; the direction tabs are discrete and stay instant.
    const settled = useDebouncedValue(input);
    const pending = settled !== input;

    // Pure and deterministic, so the server-rendered pass already carries it.
    const result = convert(direction, settled);
    const output = result.ok ? result.output : "";
    const toCompose = direction === "runToCompose";

    // Not capped with `maxLength`: a command cut short converts into a
    // container nobody asked for. The domain refuses past the ceiling; the
    // meter says so first.
    const inputLimit = useInputLimit(input.length, MAX_INPUT_LENGTH);

    function describeFailure(failure: Extract<ConversionResult, { ok: false }>): string | null {
        switch (failure.reason) {
            case "empty":
                return null;
            case "too_long":
                return tErrors("tooLong", { max: MAX_INPUT_LENGTH });
            case "unbalanced_quote":
                return tErrors("unbalancedQuote");
            case "no_run_command":
                return tErrors("noRunCommand");
            case "missing_value":
                return tErrors("missingValue", { token: failure.token ?? "" });
            case "missing_image":
                return tErrors("missingImage");
            case "invalid_yaml":
                return failure.line === undefined
                    ? tErrors("invalidYaml")
                    : tErrors("invalidYamlAt", { line: failure.line });
            case "not_compose":
                return tErrors("notCompose");
            case "no_runnable_service":
                return tErrors("noRunnableService");
        }
    }

    const failure = result.ok ? null : describeFailure(result);
    const status: { tone: StatusTone; message: string } = result.ok
        ? {
              tone: "success",
              message: t("statusReady", {
                  services: result.services.length,
                  notes: result.notes.length,
              }),
          }
        : failure === null
          ? { tone: "idle", message: t("statusEmpty") }
          : { tone: "error", message: failure };

    function changeDirection(next: DockerComposeDirection) {
        // An untouched example follows the direction; anything typed stays put.
        if (input === SAMPLES[direction]) {
            setInput(SAMPLES[next]);
        }

        setDirection(next);
    }

    function handleSwap() {
        if (output.length === 0) {
            return;
        }

        setInput(output);
        setDirection(toCompose ? "composeToRun" : "runToCompose");
    }

    async function handleCopy() {
        const copied = await copyText(output);

        if (copied.ok) {
            toast.success(tToast("copied"));

            return;
        }

        toast.error(
            copied.reason === "empty"
                ? tToast("copyFailedEmpty")
                : copied.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied"),
        );
    }

    function handleDownload() {
        const exported = createDockerComposeExportFile(direction, output);

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "docker_compose.download_failed", {
                direction,
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <Label className="text-muted-foreground text-xs">
                        <span className="leading-[1.3]">{t("directionLabel")}</span>
                    </Label>
                    <Tabs
                        value={direction}
                        onValueChange={(next) => {
                            if (next !== null) {
                                changeDirection(next as DockerComposeDirection);
                            }
                        }}
                    >
                        <TabsList className="w-full max-w-80">
                            {DOCKER_COMPOSE_DIRECTIONS.map((value) => (
                                <TabsTrigger key={value} value={value}>
                                    {tDirections(value)}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                    <div className="flex min-w-0 flex-col gap-3">
                        <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                            <StepLabel step={1} htmlFor={inputId}>
                                {toCompose ? t("inputLabelRun") : t("inputLabelCompose")}
                            </StepLabel>
                            <div className="flex items-center gap-1.5">
                                <InputLimitMeter reading={inputLimit} className="mr-1" />

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setInput(SAMPLES[direction])}
                                >
                                    <IconWand
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
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
                            language={toCompose ? LANGUAGE.run : LANGUAGE.compose}
                            lineNumbers={!toCompose}
                            placeholder={toCompose ? t("placeholderRun") : t("placeholderCompose")}
                            ariaDescribedBy={statusId}
                            onChange={setInput}
                            // Tall enough for the whole example on arrival; the grip still resizes it.
                            className="[&_textarea]:h-108"
                        />

                        <StatusStrip
                            id={statusId}
                            tone={status.tone}
                            message={status.message}
                            className="[&>span]:min-w-0 [&>span]:wrap-break-word"
                        />
                    </div>

                    <div className="flex items-center gap-3 lg:flex-col lg:pt-10">
                        <span
                            aria-hidden="true"
                            className="bg-border h-px flex-1 lg:h-auto lg:w-px"
                        />
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <button
                                        type="button"
                                        onClick={handleSwap}
                                        disabled={output.length === 0}
                                        aria-label={t("swap")}
                                        className={cn(
                                            buttonVariants({ variant: "outline", size: "icon-sm" }),
                                            "rounded-full",
                                        )}
                                    />
                                }
                            >
                                <IconArrowsUpDown
                                    className="size-4 lg:hidden"
                                    stroke={1.75}
                                    aria-hidden="true"
                                />
                                <IconArrowsLeftRight
                                    className="hidden size-4 lg:block"
                                    stroke={1.75}
                                    aria-hidden="true"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("swap")}</TooltipContent>
                        </Tooltip>
                        <span
                            aria-hidden="true"
                            className="bg-border h-px flex-1 lg:h-auto lg:w-px"
                        />
                    </div>

                    <div className={RESULT_TRAY}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <StepLabel step={2}>
                                {toCompose ? t("outputLabelCompose") : t("outputLabelRun")}
                            </StepLabel>
                            <div className="flex items-center gap-1.5">
                                {/* The one filled button: taking the result is where the tool ends. */}
                                <Button
                                    size="sm"
                                    onClick={handleCopy}
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
                            language={toCompose ? LANGUAGE.compose : LANGUAGE.run}
                            placeholder={t("outputPlaceholder")}
                            pending={pending}
                            className="bg-card max-h-108"
                        />
                    </div>
                </div>

                {result.ok && <NotesList notes={result.notes} />}
            </CardContent>
        </Card>
    );
}
