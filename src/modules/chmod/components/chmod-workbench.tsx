"use client";

import { IconClipboardCheck } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { RESULT_TRAY, StepLabel } from "@/modules/tools/components/workbench-step";
import { copyText } from "@/modules/tools/domain/clipboard";
import { DEFAULT_PATH, MAX_MODE_INPUT_LENGTH, MAX_PATH_LENGTH } from "../domain/constants";
import { describeMode } from "../domain/mode";
import { parseOctalMode, parseSymbolicMode } from "../domain/parse";
import { CHMOD_OUTPUTS, CHMOD_PRESETS, type ChmodOutput, type ModeParseFailure } from "../types";
import { PermissionGrid } from "./permission-grid";

type ModeField = "octal" | "symbolic";

/**
 * One mode, and at most one field's text that has not become a mode yet. The
 * grid, the presets and the other field all read `mode`; only the field being
 * typed in shows its own text, so `75` on the way to `755` is not rewritten
 * under the caret and `758` stays on screen beside its error.
 */
type ChmodState = {
    readonly mode: number;
    readonly draft: { readonly field: ModeField; readonly text: string } | null;
};

const PARSERS = { octal: parseOctalMode, symbolic: parseSymbolicMode } as const;

type ChmodWorkbenchProps = {
    initialMode: number;
};

export function ChmodWorkbench({ initialMode }: ChmodWorkbenchProps) {
    const t = useTranslations("chmod.workbench");
    const tPresets = useTranslations("chmod.presets");
    const tOutputs = useTranslations("chmod.outputs");
    const tErrors = useTranslations("chmod.errors");
    const tToast = useTranslations("chmod.toast");
    const formatter = useFormatter();

    const octalId = useId();
    const symbolicId = useId();
    const octalStatusId = useId();
    const symbolicStatusId = useId();
    const pathId = useId();
    const pathHintId = useId();

    const [state, setState] = useState<ChmodState>({ mode: initialMode, draft: null });
    const [path, setPath] = useState("");
    const [copied, markCopied] = useCopyFeedback<ChmodOutput>();

    // No debounce, deliberately: three editors over one value, each a
    // controlled input, and every parse is a dozen character checks. A settled
    // value would revert the grid's ticks and the fields' keystrokes for 300 ms.
    const description = describeMode(state.mode, path);
    const matchedPreset = CHMOD_PRESETS.find((preset) => Number.parseInt(preset, 8) === state.mode);

    function setMode(mode: number) {
        setState({ mode, draft: null });
    }

    function editField(field: ModeField, text: string) {
        const parsed = PARSERS[field](text);

        setState((current) => ({
            mode: parsed.ok ? parsed.mode : current.mode,
            draft: { field, text },
        }));
    }

    function fieldValue(field: ModeField): string {
        if (state.draft?.field === field) {
            return state.draft.text;
        }

        return field === "octal" ? description.octal : description.symbolic;
    }

    function fieldFailure(field: ModeField): ModeParseFailure | null {
        if (state.draft?.field !== field) {
            return null;
        }

        const parsed = PARSERS[field](state.draft.text);

        return parsed.ok ? null : parsed;
    }

    function describeFailure(failure: ModeParseFailure): string {
        switch (failure.reason) {
            case "empty":
                return tErrors("empty");
            case "out_of_range":
                return tErrors("outOfRange");
            case "invalid_length":
                return tErrors("invalidLength");
            case "invalid_character":
                return failure.expected === undefined
                    ? tErrors("notOctal", { position: failure.position ?? 0 })
                    : tErrors("notInSlot", {
                          position: failure.position ?? 0,
                          expected: formatter.list(failure.expected, { type: "disjunction" }),
                      });
        }
    }

    async function handleCopy(output: ChmodOutput) {
        const result = await copyText(description[output]);

        if (!result.ok) {
            toast.error(
                result.reason === "empty"
                    ? tToast("copyFailedEmpty")
                    : result.reason === "unsupported"
                      ? tToast("copyFailedUnsupported")
                      : tToast("copyFailedDenied"),
            );

            return;
        }

        markCopied(output);
        toast.success(tToast("copied", { output: tOutputs(output) }));
    }

    function renderField(field: ModeField, id: string, statusId: string) {
        const failure = fieldFailure(field);

        return (
            <div className="flex min-w-0 flex-col gap-1.5">
                {field === "octal" ? (
                    <StepLabel step={1} htmlFor={id}>
                        {t("octalLabel")}
                    </StepLabel>
                ) : (
                    <Label htmlFor={id} className="flex min-h-7 items-center text-sm">
                        {t("symbolicLabel")}
                    </Label>
                )}
                <Input
                    id={id}
                    value={fieldValue(field)}
                    onChange={(event) => editField(field, event.target.value)}
                    // A short identity field: one character past a mode is
                    // already a mistake, so the cap refuses it outright.
                    maxLength={MAX_MODE_INPUT_LENGTH}
                    placeholder={field === "octal" ? "755" : "rwxr-xr-x"}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    inputMode={field === "octal" ? "numeric" : "text"}
                    aria-invalid={failure !== null}
                    aria-describedby={statusId}
                    className="bg-card/70 h-11 rounded-xl font-mono text-base tracking-wider"
                />
                <StatusStrip
                    id={statusId}
                    tone={failure === null ? "idle" : "error"}
                    message={failure === null ? t(`${field}Hint`) : describeFailure(failure)}
                />
            </div>
        );
    }

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <div
                        role="group"
                        aria-label={t("presetsLabel")}
                        className="flex flex-wrap items-center gap-1.5"
                    >
                        {CHMOD_PRESETS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                aria-pressed={matchedPreset === preset}
                                onClick={() => setMode(Number.parseInt(preset, 8))}
                                className={cn(
                                    "h-8 rounded-lg px-3 font-mono text-sm tabular-nums transition-colors duration-200",
                                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                    matchedPreset === preset
                                        ? "bg-primary/10 text-primary ring-primary/25 ring-1 ring-inset"
                                        : "text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground ring-1 ring-inset",
                                )}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                    <p className="text-muted-foreground min-h-5 text-xs leading-normal">
                        {matchedPreset !== undefined && tPresets(matchedPreset)}
                    </p>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <div className="flex min-w-0 flex-col gap-4">
                        {renderField("octal", octalId, octalStatusId)}
                        {renderField("symbolic", symbolicId, symbolicStatusId)}
                    </div>
                    <PermissionGrid
                        mode={state.mode}
                        onToggle={(mask) => setMode(state.mode ^ mask)}
                    />
                </div>

                <div className={RESULT_TRAY}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <StepLabel step={2}>{t("resultLabel")}</StepLabel>
                        <Button size="sm" onClick={() => handleCopy("command")}>
                            <IconClipboardCheck
                                className="size-3.5"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {t("copyCommand")}
                        </Button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={pathId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("pathLabel")}</span>
                        </Label>
                        <Input
                            id={pathId}
                            value={path}
                            onChange={(event) => setPath(event.target.value)}
                            maxLength={MAX_PATH_LENGTH}
                            placeholder={DEFAULT_PATH}
                            spellCheck={false}
                            autoComplete="off"
                            autoCapitalize="off"
                            aria-describedby={pathHintId}
                            className="bg-card h-9 rounded-lg font-mono text-[0.8125rem]"
                        />
                        <p
                            id={pathHintId}
                            className="text-muted-foreground text-[0.6875rem] leading-[1.4]"
                        >
                            {t("pathHint")}
                        </p>
                    </div>

                    <dl className="flex flex-col gap-1.5">
                        {CHMOD_OUTPUTS.map((output) => (
                            <div
                                key={output}
                                className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
                            >
                                <dt className="text-muted-foreground text-right text-xs leading-[1.3]">
                                    {tOutputs(output)}
                                </dt>
                                <dd className="bg-card ring-border/70 min-w-0 rounded-lg px-3 py-2 font-mono text-[0.8125rem] leading-[1.4] break-all ring-1 ring-inset">
                                    {description[output]}
                                </dd>
                                <IconCopyButton
                                    copied={copied === output}
                                    onClick={() => handleCopy(output)}
                                    aria-label={t("copyOutput", { output: tOutputs(output) })}
                                />
                            </div>
                        ))}
                    </dl>

                    {description.worldWritable && (
                        <StatusStrip tone="warning" message={t("worldWritable")} />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
