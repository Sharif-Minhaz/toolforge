"use client";

import { IconClipboardCheck, IconCopy, IconDownload, IconWand, IconX } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { CodeEditor } from "@/modules/tools/components/code-editor";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useImagePaste } from "@/modules/tools/components/use-image-paste";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { pastedImageFilename } from "@/modules/tools/domain/pasted-image";
import { MAX_EQUATION_INPUT_LENGTH, MAX_EQUATIONS, SAMPLE_INPUT } from "../domain/constants";
import { createEquationExportFile } from "../domain/export";
import { formatAll, formatEquation } from "../domain/formats";
import { convertTextToLatex } from "../domain/text-to-latex";
import { toConvertedEquations } from "../domain/recognition";
import {
    CONVERSION_NOTES,
    EQUATION_SOURCES,
    OUTPUT_FORMATS,
    type ConversionNote,
    type ConvertedEquation,
    type EquationFailureReason,
    type EquationReading,
    type EquationSource,
    type FormatResult,
    type OutputFormat,
    type PickedImage,
    type RecognitionResult,
} from "../types";
import { EquationImageInput } from "./equation-image-input";
import { EquationTabs } from "./equation-tabs";
import { LatexPreview } from "./latex-preview";
import { ReadingPicker } from "./reading-picker";

/**
 * One equation as the reader currently has it.
 *
 * `generated` is kept beside `latex` rather than thrown away, because the whole
 * editing contract rests on the difference: the tab shows a marker when they
 * have diverged, and pressing Convert again is the only thing that may put them
 * back in step.
 */
type EquationDraft = {
    readonly source: string;
    readonly generated: string;
    readonly latex: string;
    readonly notes: readonly ConversionNote[];
    /** The alternatives offered under the source box; empty when there are none. */
    readonly readings: readonly EquationReading[];
};

function toDraft(equation: ConvertedEquation): EquationDraft {
    return {
        source: equation.source,
        generated: equation.latex,
        latex: equation.latex,
        notes: equation.notes,
        readings: equation.readings,
    };
}

type EquationWorkbenchProps = {
    initialText: string;
    initialDisplay: boolean;
    /** Converted on the server, so the first paint already carries the answer. */
    initialEquations: readonly ConvertedEquation[];
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent, which disables reading. */
    siteKey: string | null;
    /** Whether this deployment has a recognizer worker and a key for it. */
    recognizerConfigured: boolean;
};

export function EquationWorkbench({
    initialText,
    initialDisplay,
    initialEquations,
    siteKey,
    recognizerConfigured,
}: EquationWorkbenchProps) {
    const t = useTranslations("equation.workbench");
    const tSources = useTranslations("equation.sources");
    const tFormats = useTranslations("equation.formats");
    const tNotes = useTranslations("equation.notes");
    const tErrors = useTranslations("equation.errors");
    const tToast = useTranslations("equation.toast");
    const formatter = useFormatter();

    const inputId = useId();
    const sourceId = useId();
    const statusId = useId();
    const tabsLabelId = useId();
    const previewLabelId = useId();
    const sourceLabelId = useId();

    const [source, setSource] = useState<EquationSource>("text");
    const [picked, setPicked] = useState<PickedImage | null>(null);
    const [text, setText] = useState(initialText);
    const [drafts, setDrafts] = useState<readonly EquationDraft[]>(() =>
        initialEquations.map(toDraft),
    );
    const [active, setActive] = useState(0);
    const [display, setDisplay] = useState(initialDisplay);
    const [format, setFormat] = useState<OutputFormat>("latex");
    const [failure, setFailure] = useState<EquationFailureReason | null>(null);

    const { ref: resultRef, scrollToResult } = useResultScroll<HTMLDivElement>();

    // A counter rather than a clock or a random id, so nothing here is a
    // per-render source of entropy and two pastes never share a filename.
    const pasteCount = useRef(0);

    // Revoking on the way out rather than in the picker: the cleanup fires both
    // when the preview is replaced and when the page is left, so there is one
    // rule instead of one per exit.
    useEffect(() => {
        const url = picked?.url;

        return () => {
            if (url) {
                URL.revokeObjectURL(url);
            }
        };
    }, [picked?.url]);

    function handlePick(file: File | undefined) {
        if (file === undefined) {
            return;
        }

        setPicked({ file, url: URL.createObjectURL(file) });
    }

    /**
     * Ctrl+V with a picture on the clipboard, from the Text tab.
     *
     * Pasting an image is unambiguous about what the reader wants, so it moves
     * them rather than asking: the tab switches and the picture is loaded, ready
     * to read. It stops there rather than sending it — reading a picture costs a
     * model call and needs a solved challenge, and neither is something a
     * keystroke should spend on somebody's behalf.
     *
     * Enabled only on the Text tab. The image panel binds its own listener
     * through `ImageSourceControls`, and one of the two is always off, so a
     * paste is handled exactly once. The listener also only ever claims a paste
     * that really holds a picture, so Ctrl+V into the textarea still pastes text.
     */
    useImagePaste((file) => {
        pasteCount.current += 1;

        setSource("image");
        handlePick(
            new File([file], pastedImageFilename(file.type, pasteCount.current), {
                type: file.type,
                // Constant rather than `Date.now()`: nothing reads it, and a
                // real clock here would make the handler impure.
                lastModified: 0,
            }),
        );
    }, source === "text");

    // Not capped: an equation is pasted whole, and a trimmed one is a different
    // equation. `convertTextToLatex` refuses past the ceiling instead.
    const inputLimit = useInputLimit(text.length, MAX_EQUATION_INPUT_LENGTH);

    const current = drafts[active];

    // Only the hand-edited source settles. Conversion is a press, never a
    // keystroke — see `handleConvert` — so nothing else needs a debounce.
    const settledLatex = useDebouncedValue(current?.latex ?? "");
    const pending = settledLatex !== (current?.latex ?? "");

    const guessed = drafts.some((draft) => draft.notes.length > 0);

    const status: { tone: StatusTone; message: string } =
        failure !== null
            ? { tone: "error", message: describeFailure(failure) }
            : drafts.length === 0
              ? { tone: "idle", message: t("statusEmpty") }
              : guessed
                ? { tone: "warning", message: t("statusGuessed", { count: drafts.length }) }
                : { tone: "success", message: t("statusReady", { count: drafts.length }) };

    function describeFailure(reason: EquationFailureReason): string {
        switch (reason) {
            case "empty_input":
                return tErrors("empty_input");
            case "too_long":
                return tErrors("too_long", {
                    max: formatter.number(MAX_EQUATION_INPUT_LENGTH),
                });
            case "too_many_equations":
                return tErrors("too_many_equations", { max: formatter.number(MAX_EQUATIONS) });
        }
    }

    function handleConvert() {
        const result = convertTextToLatex(text);

        if (!result.ok) {
            setFailure(result.reason);
            setDrafts([]);

            return;
        }

        // Every draft is replaced, hand edits included. The button beside this
        // says so before it is pressed; silently keeping an edited equation
        // would leave the reader with a result that matches no input.
        setFailure(null);
        setDrafts(result.equations.map(toDraft));
        setActive(0);

        // Only when the input said so. A paste that arrived wrapped in `$$`
        // asked for a display block and gets one; text with no delimiters says
        // nothing about it, and silently flipping the reader's own switch would
        // be an edit they did not make.
        if (result.display !== null) {
            setDisplay(result.display);
        }

        scrollToResult();
    }

    /**
     * The seam, from the island's side.
     *
     * A recognized reply becomes exactly the same drafts a typed conversion
     * produces, so everything below — the tabs, the editor, the preview, the
     * copy formats, the export — carries on without knowing a picture was
     * involved. The only thing that crosses is the model's display judgement,
     * which is the one fact about the picture the LaTeX cannot carry.
     */
    function handleRecognition(result: RecognitionResult) {
        if (!result.ok) {
            // The image panel renders the reason itself, beside the control
            // that caused it. Repeating it down here would say the same thing
            // twice, so the results area is simply cleared.
            setDrafts([]);
            setFailure(null);

            return;
        }

        const mapped = toConvertedEquations(result.equations, (index) =>
            t("equationTab", { number: formatter.number(index + 1) }),
        );

        setFailure(null);
        setDrafts(mapped.equations.map(toDraft));
        setActive(0);
        setDisplay(mapped.displayMode);
        scrollToResult();
        toast.success(
            mapped.truncated
                ? tToast("recognizedTruncated", { count: mapped.equations.length })
                : tToast("recognized", { count: mapped.equations.length }),
        );
    }

    function handleEdit(latex: string) {
        setDrafts((currentDrafts) =>
            currentDrafts.map((draft, index) => (index === active ? { ...draft, latex } : draft)),
        );
    }

    /**
     * Choosing a different reading of the same line.
     *
     * It replaces a hand edit, and that is correct rather than a lapse in the
     * "never overwrite an edit" rule: pressing a row *is* the explicit act that
     * rule reserves the overwrite for. `generated` moves with it, so the edited
     * marker reflects the reading now on screen instead of the one first
     * offered.
     */
    function handleReading(reading: EquationReading) {
        setDrafts((currentDrafts) =>
            currentDrafts.map((draft, index) =>
                index === active
                    ? {
                          ...draft,
                          generated: reading.latex,
                          latex: reading.latex,
                          notes: reading.notes,
                      }
                    : draft,
            ),
        );
    }

    function handleClear() {
        setText("");
        setDrafts([]);
        setActive(0);
        setFailure(null);
    }

    function reportCopyFailure(copied: Extract<CopyResult, { ok: false }>) {
        const message =
            copied.reason === "empty"
                ? tToast("copyFailedEmpty")
                : copied.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied");

        toast.error(message);
    }

    async function copyFormatted(formatted: FormatResult, success: string) {
        if (!formatted.ok) {
            // The only format that can fail is MathML, and it fails for one
            // reason: KaTeX could not parse the source. Named rather than
            // reported as a clipboard problem, which it is not.
            toast.error(
                formatted.message.length === 0
                    ? tToast("copyFailedEmpty")
                    : tErrors("mathmlFailed"),
            );

            return;
        }

        const copied = await copyText(formatted.text);

        if (!copied.ok) {
            reportCopyFailure(copied);

            return;
        }

        toast.success(success);
    }

    async function handleCopy() {
        await copyFormatted(
            formatEquation(current?.latex ?? "", format, display),
            tToast("copied"),
        );
    }

    /**
     * A draft back to the shape the domain layer speaks.
     *
     * `latex` is the reader's current text rather than `generated`, so copying
     * and downloading take the equation as it stands on screen — hand edits and
     * chosen readings included.
     */
    function toEquation(draft: EquationDraft): ConvertedEquation {
        return {
            source: draft.source,
            latex: draft.latex,
            notes: draft.notes,
            readings: draft.readings,
        };
    }

    async function handleCopyAll() {
        await copyFormatted(
            formatAll(drafts.map(toEquation), format, display),
            tToast("copiedAll", { count: drafts.length }),
        );
    }

    function handleDownload() {
        const exported = createEquationExportFile({
            equations: drafts.map(toEquation),
            generatedAt: new Date(),
        });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "equation.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    const formatLabels = Object.fromEntries(
        OUTPUT_FORMATS.map((value) => [value, tFormats(value)]),
    );

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
                    <Label id={sourceLabelId} className="text-muted-foreground text-xs">
                        {t("sourceModeLabel")}
                    </Label>
                    <div
                        role="radiogroup"
                        aria-labelledby={sourceLabelId}
                        className="bg-muted/70 ring-border/60 inline-flex w-fit items-center gap-1 rounded-xl p-1 ring-1 ring-inset"
                    >
                        {EQUATION_SOURCES.map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                role="radio"
                                aria-checked={source === mode}
                                onClick={() => setSource(mode)}
                                className={cn(
                                    "relative flex h-8 items-center justify-center rounded-lg px-3.5",
                                    "text-[0.8125rem] leading-[1.3] font-medium",
                                    "transition-colors duration-200 outline-none",
                                    "focus-visible:ring-ring focus-visible:ring-2",
                                    source === mode
                                        ? "bg-card text-foreground ring-border shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {tSources(mode)}
                            </button>
                        ))}
                    </div>
                </div>

                {source === "image" ? (
                    <EquationImageInput
                        siteKey={siteKey}
                        configured={recognizerConfigured}
                        picked={picked}
                        onPick={handlePick}
                        onRemove={() => setPicked(null)}
                        onResult={handleRecognition}
                    />
                ) : (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                                {t("inputLabel")}
                            </Label>
                            <div className="flex items-center gap-1.5">
                                <InputLimitMeter reading={inputLimit} />
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    disabled={text.length === 0 && drafts.length === 0}
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
                        <Textarea
                            id={inputId}
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            placeholder={SAMPLE_INPUT}
                            spellCheck={false}
                            autoComplete="off"
                            className="bg-card/70 max-h-64 min-h-28 resize-y rounded-xl font-mono text-[0.875rem] leading-6"
                        />

                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={handleConvert} disabled={text.trim().length === 0}>
                                <IconWand className="size-4" stroke={1.8} aria-hidden="true" />
                                {drafts.length === 0 ? t("convert") : t("reconvert")}
                            </Button>
                            {drafts.length > 0 && (
                                <p className="text-muted-foreground max-w-[46ch] text-[0.6875rem] leading-[1.4]">
                                    {t("reconvertHint")}
                                </p>
                            )}
                        </div>

                        <StatusStrip id={statusId} tone={status.tone} message={status.message} />
                    </div>
                )}

                {current !== undefined && (
                    <div ref={resultRef} className="flex scroll-mt-24 flex-col gap-4">
                        {drafts.length > 1 && (
                            <div className="flex flex-col gap-2">
                                <Label id={tabsLabelId} className="text-muted-foreground text-xs">
                                    {t("equationsLabel")}
                                </Label>
                                <EquationTabs
                                    count={drafts.length}
                                    active={active}
                                    labelId={tabsLabelId}
                                    edited={drafts.map((draft) => draft.latex !== draft.generated)}
                                    onSelect={setActive}
                                />
                            </div>
                        )}

                        {/* Source and preview side by side once there is room for
                            both; stacked on a phone, source first, because the
                            preview is what you check the source against. */}
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="flex min-w-0 flex-col gap-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Label
                                        htmlFor={sourceId}
                                        className="text-muted-foreground text-xs"
                                    >
                                        {t("sourceLabel")}
                                    </Label>
                                    {current.latex !== current.generated && (
                                        <span className="text-brand-amber text-[0.6875rem] font-medium">
                                            {t("sourceEdited")}
                                        </span>
                                    )}
                                </div>
                                <CodeEditor
                                    id={sourceId}
                                    value={current.latex}
                                    language="latex"
                                    placeholder={t("sourcePlaceholder")}
                                    onChange={handleEdit}
                                    className="min-h-32"
                                />
                                <p className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                                    {t("characters", {
                                        count: formatter.number([...current.latex].length),
                                    })}
                                </p>
                            </div>

                            <div className="flex min-w-0 flex-col gap-2">
                                <Label
                                    id={previewLabelId}
                                    className="text-muted-foreground text-xs"
                                >
                                    {t("previewLabel")}
                                </Label>
                                <LatexPreview
                                    latex={settledLatex}
                                    display={display}
                                    pending={pending}
                                    labelledBy={previewLabelId}
                                />
                                {current.notes.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                        <p className="text-muted-foreground text-[0.6875rem] font-medium">
                                            {tNotes("title")}
                                        </p>
                                        <ul className="text-muted-foreground flex list-disc flex-col gap-0.5 pl-4 text-[0.6875rem] leading-[1.4]">
                                            {CONVERSION_NOTES.filter((note) =>
                                                current.notes.includes(note),
                                            ).map((note) => (
                                                <li key={note}>{tNotes(note)}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>

                        {current.readings.length > 1 && (
                            <ReadingPicker
                                readings={current.readings}
                                selected={current.latex}
                                display={display}
                                onSelect={handleReading}
                            />
                        )}

                        <div className="grid gap-2 sm:grid-cols-2">
                            <OptionSwitch
                                label={t("displayLabel")}
                                hint={display ? t("displayHint") : t("inlineHint")}
                                checked={display}
                                onCheckedChange={setDisplay}
                            />
                            <OptionSelect
                                label={t("copyFormatLabel")}
                                value={format}
                                items={formatLabels}
                                values={OUTPUT_FORMATS}
                                onChange={setFormat}
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <Button variant="outline" size="sm" onClick={handleCopy}>
                                <IconClipboardCheck
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("copy")}
                            </Button>
                            {drafts.length > 1 && (
                                <Button variant="outline" size="sm" onClick={handleCopyAll}>
                                    <IconCopy
                                        className="size-3.5"
                                        stroke={1.8}
                                        aria-hidden="true"
                                    />
                                    {t("copyAll")}
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={handleDownload}>
                                <IconDownload
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("download")}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
