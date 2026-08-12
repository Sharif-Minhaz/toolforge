"use client";

import { IconPhotoPlus, IconTrash } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { ImageSourceControls } from "@/modules/tools/components/image-source-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText } from "@/modules/tools/domain/clipboard";
import { fitComponents, parseAspectRatio } from "../domain/aspect";
import {
    DEFAULT_OPTIONS,
    IMAGE_ACCEPT_ATTRIBUTE,
    MAX_COMPONENTS,
    MAX_HASH_LENGTH,
    MAX_IMAGE_BYTES,
    MAX_PIXELS,
    MAX_PUNCH,
    MIN_COMPONENTS,
    MIN_PUNCH,
    PUNCH_STEP,
} from "../domain/constants";
import { buildFromHash, buildFromSource, readSource } from "../domain/placeholder";
import type { SnippetKind } from "../domain/snippets";
import { ModeSelector } from "./mode-selector";
import { PlaceholderOutput, type OutputCopyKey } from "./placeholder-output";
import {
    ASPECT_RATIOS,
    PLACEHOLDER_EDGES,
    type AspectRatio,
    type BlurMode,
    type BlurPlaceholderOptions,
    type PlaceholderEdge,
    type PlaceholderFailure,
    type PlaceholderFailureReason,
    type PlaceholderResult,
    type PlaceholderSource,
} from "../types";

/** Component counts as `<Select>` values; the control speaks strings. */
const COMPONENT_VALUES = Array.from({ length: MAX_COMPONENTS - MIN_COMPONENTS + 1 }, (_, index) =>
    String(index + MIN_COMPONENTS),
);

const EDGE_VALUES = PLACEHOLDER_EDGES.map(String);

/** What the snippets show when there is no picture behind the hash. */
const SAMPLE_FILENAME = "/hero.jpg";

/** Turns `16:9` into `1600 × 900` — a size a reader recognises as a picture. */
const SAMPLE_SCALE = 100;

type PickedImage = {
    /** Bumped per pick, so the pipeline key changes even for the same file. */
    readonly id: number;
    readonly source: PlaceholderSource;
    readonly previewUrl: string;
};

type BlurPlaceholderWorkbenchProps = {
    /** Parsed from the search params on the server, so a shared link opens ready. */
    initialMode: BlurMode;
    initialOptions: BlurPlaceholderOptions;
    initialHash: string;
    /** Whether this deployment can fetch a picture by its address at all. */
    urlImportEnabled: boolean;
};

export function BlurPlaceholderWorkbench({
    initialMode,
    initialOptions,
    initialHash,
    urlImportEnabled,
}: BlurPlaceholderWorkbenchProps) {
    const t = useTranslations("blurPlaceholder.workbench");
    const tErrors = useTranslations("blurPlaceholder.errors");
    const tToast = useTranslations("blurPlaceholder.toast");
    const format = useFormatter();
    const byteLabel = useByteLabel();
    const [copied, markCopied] = useCopyFeedback<OutputCopyKey>();

    const inputId = useId();
    const hintId = useId();
    const modeLabelId = useId();
    const hashId = useId();
    const punchId = useId();

    const [mode, setMode] = useState<BlurMode>(initialMode);
    const [options, setOptions] = useState<BlurPlaceholderOptions>(initialOptions);
    const [hashInput, setHashInput] = useState(initialHash);
    const [picked, setPicked] = useState<PickedImage | null>(null);
    const [dragging, setDragging] = useState(false);
    const [reading, setReading] = useState(false);
    const [pickFailure, setPickFailure] = useState<PlaceholderFailure | null>(null);
    const [snippet, setSnippet] = useState<SnippetKind>("next");
    const [output, setOutput] = useState<{ key: string; result: PlaceholderResult } | null>(null);
    // Whether the reader has taken the detail pair into their own hands. Until
    // they do, picking a picture fits the grid to its proportions; after they
    // do, a second picture must not silently undo the choice they made.
    const [detailChosen, setDetailChosen] = useState(
        initialOptions.componentX !== DEFAULT_OPTIONS.componentX ||
            initialOptions.componentY !== DEFAULT_OPTIONS.componentY,
    );

    const nextId = useRef(0);
    // Held outside state so the unmount cleanup sees every URL ever handed out.
    const previewUrls = useRef(new Set<string>());

    useEffect(() => {
        const urls = previewUrls.current;

        return () => {
            for (const url of urls) {
                URL.revokeObjectURL(url);
            }

            urls.clear();
        };
    }, []);

    // A pasted hash settles first; every other control is discrete and applies
    // at once. A run is a transform plus a PNG encode — cheap, but not free, and
    // the panel would otherwise redraw on every keystroke of a 28-character
    // string most people paste in one go anyway.
    const settledHash = useDebouncedValue(hashInput).trim();

    const decoding = mode === "decode";
    const hasWork = decoding ? settledHash.length > 0 : picked !== null;
    const key = JSON.stringify([mode, picked?.id ?? null, options, decoding ? settledHash : ""]);

    useEffect(() => {
        let pending: Promise<PlaceholderResult> | null = null;

        if (mode === "decode" && settledHash.length > 0) {
            pending = buildFromHash(settledHash, parseAspectRatio(options.ratio), options);
        } else if (mode === "encode" && picked !== null) {
            pending = buildFromSource(picked.source, options);
        }

        if (pending === null) {
            return;
        }

        let cancelled = false;

        void pending
            .catch((caught: unknown) => {
                logEvent("error", "blur_placeholder.build_threw", {
                    error: describeError(caught),
                });

                return { ok: false, reason: "encode_failed" } as const;
            })
            .then((result) => {
                if (!cancelled) {
                    setOutput({ key, result });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [key, mode, settledHash, picked, options]);

    // A result from an earlier setting is discarded rather than shown: the panel
    // dims and says it is working instead of asserting a stale value.
    const result = output?.key === key ? output.result : null;
    const placeholder = result?.ok === true ? result.placeholder : null;
    const shown = output?.result.ok === true ? output.result.placeholder : null;
    const typing = decoding && hashInput.trim() !== settledHash;
    const working = hasWork && result === null;
    const failure = result?.ok === false ? result : null;

    // While decoding, the detail counts belong to the hash rather than to the
    // panel — the first character of every hash records both — so the disabled
    // controls show what was read rather than what was last set here.
    const shownComponentX = decoding && shown !== null ? shown.componentX : options.componentX;
    const shownComponentY = decoding && shown !== null ? shown.componentY : options.componentY;

    const ratioShape = parseAspectRatio(options.ratio);
    const fromPicture = !decoding && picked !== null;
    const snippetSize = fromPicture
        ? { width: picked.source.sourceWidth, height: picked.source.sourceHeight }
        : { width: ratioShape.width * SAMPLE_SCALE, height: ratioShape.height * SAMPLE_SCALE };

    function describeFailure(reason: PlaceholderFailureReason, at?: number): string {
        switch (reason) {
            case "too_large":
                return tErrors("too_large", { limit: byteLabel(MAX_IMAGE_BYTES) });
            case "too_many_pixels":
                return tErrors("too_many_pixels", {
                    count: format.number(Math.round(MAX_PIXELS / 1_000_000)),
                });
            case "invalid_character":
                return tErrors("invalid_character", { position: format.number(at ?? 0) });
            case "length_mismatch":
                return tErrors("length_mismatch", { expected: format.number(at ?? 0) });
            default:
                return tErrors(reason);
        }
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (reading) {
            return { tone: "pending", message: t("statusReading") };
        }

        if (pickFailure !== null) {
            return { tone: "error", message: describeFailure(pickFailure.reason) };
        }

        if (!hasWork) {
            return {
                tone: "idle",
                message: decoding ? t("statusPasteHash") : t("statusPickImage"),
            };
        }

        if (working) {
            return { tone: "pending", message: t("statusWorking") };
        }

        if (failure !== null) {
            return {
                tone: "error",
                message: describeFailure(
                    failure.reason,
                    failure.position ?? failure.expectedLength,
                ),
            };
        }

        return placeholder === null
            ? { tone: "idle", message: t("statusPickImage") }
            : {
                  tone: "success",
                  message: t("statusDone", {
                      count: format.number(placeholder.hash.length),
                      size: byteLabel(placeholder.dataUriBytes),
                  }),
              };
    }

    function patchOptions(patch: Partial<BlurPlaceholderOptions>) {
        setOptions((current) => ({ ...current, ...patch }));
    }

    function chooseDetail(patch: Partial<BlurPlaceholderOptions>) {
        setDetailChosen(true);
        patchOptions(patch);
    }

    function handleModeChange(next: BlurMode) {
        setMode(next);
        setPickFailure(null);

        // Switching to Decode with a hash already in hand should show that hash,
        // not an empty box the reader has to copy into by hand.
        if (next === "decode" && hashInput.trim().length === 0 && shown !== null) {
            setHashInput(shown.hash);
        }
    }

    function releasePreview(url: string) {
        URL.revokeObjectURL(url);
        previewUrls.current.delete(url);
    }

    async function handlePick(files: readonly File[]) {
        const file = files[0];

        if (file === undefined || reading) {
            return;
        }

        setReading(true);
        setPickFailure(null);

        try {
            const outcome = await readSource(file).catch((caught: unknown) => {
                logEvent("error", "blur_placeholder.read_threw", { error: describeError(caught) });

                return { ok: false, reason: "encode_failed" } as const;
            });

            if (!outcome.ok) {
                logEvent("warn", "blur_placeholder.read_failed", { reason: outcome.reason });
                setPickFailure(outcome);

                return;
            }

            const url = URL.createObjectURL(file);

            previewUrls.current.add(url);

            // A 4 × 3 grid over a 16:9 photograph spends coefficients on detail
            // that is not there and starves the direction that is. Fitting the
            // pair to the picture is the single biggest thing between a blur
            // that resembles its source and one that does not.
            if (!detailChosen) {
                setOptions((current) => ({
                    ...current,
                    ...fitComponents({
                        width: outcome.source.sourceWidth,
                        height: outcome.source.sourceHeight,
                    }),
                }));
            }

            setPicked((current) => {
                if (current !== null) {
                    releasePreview(current.previewUrl);
                }

                return { id: (nextId.current += 1), source: outcome.source, previewUrl: url };
            });
        } finally {
            setReading(false);
        }
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);
        void handlePick([...event.dataTransfer.files]);
    }

    function handleClear() {
        setPicked((current) => {
            if (current !== null) {
                releasePreview(current.previewUrl);
            }

            return null;
        });
        setPickFailure(null);
    }

    async function handleCopy(target: OutputCopyKey, value: string) {
        const copyResult = await copyText(value);

        if (copyResult.ok) {
            markCopied(target);
            toast.success(tToast(`copied_${target}`));

            return;
        }

        logEvent("error", "blur_placeholder.copy_failed", { reason: copyResult.reason });
        toast.error(tToast("copyFailed"));
    }

    const status = describeStatus();

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
                <div className="flex min-w-0 flex-col gap-1.5">
                    <span id={modeLabelId} className="text-muted-foreground text-xs leading-[1.3]">
                        {t("modeLabel")}
                    </span>
                    <ModeSelector value={mode} onChange={handleModeChange} labelId={modeLabelId} />
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                    {decoding ? (
                        <>
                            <label
                                htmlFor={hashId}
                                className="text-muted-foreground text-xs leading-[1.3]"
                            >
                                {t("hashInputLabel")}
                            </label>
                            <Textarea
                                id={hashId}
                                value={hashInput}
                                spellCheck={false}
                                autoComplete="off"
                                maxLength={MAX_HASH_LENGTH}
                                aria-describedby={hintId}
                                placeholder={t("hashPlaceholder")}
                                onChange={(event) => setHashInput(event.target.value)}
                                className="min-h-20 font-mono text-sm"
                            />
                        </>
                    ) : (
                        <>
                            <input
                                id={inputId}
                                type="file"
                                accept={IMAGE_ACCEPT_ATTRIBUTE}
                                disabled={reading}
                                aria-describedby={hintId}
                                onChange={(event) => {
                                    void handlePick([...(event.target.files ?? [])]);
                                    // Cleared so picking the same file twice fires.
                                    event.target.value = "";
                                }}
                                className="peer sr-only"
                            />

                            <label
                                htmlFor={inputId}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    setDragging(true);
                                }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={handleDrop}
                                className={cn(
                                    "border-border/80 bg-card/40 hover:border-primary/50 peer-focus-visible:ring-ring flex min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors duration-200 peer-focus-visible:ring-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
                                    dragging &&
                                        "border-primary/70 bg-[color-mix(in_oklch,var(--primary)_6%,transparent)]",
                                )}
                            >
                                <IconPhotoPlus
                                    className="text-muted-foreground size-7"
                                    stroke={1.6}
                                    aria-hidden="true"
                                />
                                <span className="text-[0.9375rem] leading-[1.4] font-medium">
                                    {t("dropTitle")}
                                </span>
                                <span className="text-muted-foreground text-[0.8125rem] leading-normal">
                                    {t("dropHint", { limit: byteLabel(MAX_IMAGE_BYTES) })}
                                </span>
                            </label>
                        </>
                    )}

                    <ImageSourceControls
                        onFiles={(files) => void handlePick(files)}
                        disabled={reading}
                        urlImportEnabled={urlImportEnabled}
                    />

                    <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                </div>

                {!decoding && picked !== null && (
                    <div className="bg-card/60 ring-border/70 flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                        {/* No thumbnail here: the picture is shown full size
                            beside its blur in the panel below, which is where
                            it earns its space. */}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-[0.8125rem] leading-[1.3] font-medium">
                                {picked.source.name}
                            </span>
                            <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {t("sourceSize", {
                                    width: String(picked.source.sourceWidth),
                                    height: String(picked.source.sourceHeight),
                                })}
                            </span>
                        </span>
                        <Button
                            variant="outline"
                            onClick={handleClear}
                            disabled={reading}
                            className="h-8 shrink-0 px-2.5"
                        >
                            <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                            {t("clear")}
                        </Button>
                    </div>
                )}

                <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <OptionSelect<string>
                        label={t("componentXLabel")}
                        hint={decoding ? t("componentsHintDecode") : t("componentXHint")}
                        value={String(shownComponentX)}
                        values={COMPONENT_VALUES}
                        disabled={decoding}
                        items={Object.fromEntries(COMPONENT_VALUES.map((value) => [value, value]))}
                        onChange={(next) => chooseDetail({ componentX: Number(next) })}
                    />

                    <OptionSelect<string>
                        label={t("componentYLabel")}
                        hint={decoding ? t("componentsHintDecode") : t("componentYHint")}
                        value={String(shownComponentY)}
                        values={COMPONENT_VALUES}
                        disabled={decoding}
                        items={Object.fromEntries(COMPONENT_VALUES.map((value) => [value, value]))}
                        onChange={(next) => chooseDetail({ componentY: Number(next) })}
                    />

                    <OptionSelect<AspectRatio>
                        label={t("ratioLabel")}
                        hint={decoding ? t("ratioHint") : t("ratioHintEncode")}
                        value={options.ratio}
                        values={ASPECT_RATIOS}
                        disabled={!decoding}
                        items={Object.fromEntries(ASPECT_RATIOS.map((value) => [value, value]))}
                        onChange={(next) => patchOptions({ ratio: next })}
                    />

                    <OptionSelect<string>
                        label={t("edgeLabel")}
                        hint={t("edgeHint")}
                        value={String(options.edge)}
                        values={EDGE_VALUES}
                        items={Object.fromEntries(
                            EDGE_VALUES.map((value) => [value, t("edgeValue", { value })]),
                        )}
                        onChange={(next) => patchOptions({ edge: Number(next) as PlaceholderEdge })}
                    />

                    <div className="flex min-w-0 flex-col gap-1.5">
                        <span id={punchId} className="text-muted-foreground text-xs leading-[1.3]">
                            {t("punchLabel")}
                        </span>
                        <div className="flex min-w-0 items-center gap-3">
                            <Slider
                                aria-labelledby={punchId}
                                value={options.punch}
                                min={MIN_PUNCH}
                                max={MAX_PUNCH}
                                step={PUNCH_STEP}
                                onValueChange={(next) =>
                                    patchOptions({
                                        punch: Array.isArray(next)
                                            ? (next[0] ?? options.punch)
                                            : next,
                                    })
                                }
                                className="min-w-0 flex-1"
                            />
                            <span className="w-8 shrink-0 text-right font-mono text-sm tabular-nums">
                                {options.punch.toFixed(1)}
                            </span>
                        </div>
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("punchHint")}
                        </p>
                    </div>
                </div>

                {shown !== null && (
                    <PlaceholderOutput
                        placeholder={shown}
                        punch={options.punch}
                        sourceWidth={snippetSize.width}
                        sourceHeight={snippetSize.height}
                        filename={fromPicture ? `/${picked.source.name}` : SAMPLE_FILENAME}
                        sourceUrl={fromPicture ? picked.previewUrl : null}
                        sourceName={fromPicture ? picked.source.name : null}
                        snippet={snippet}
                        stale={placeholder === null || typing}
                        copied={copied}
                        onSnippetChange={setSnippet}
                        onCopy={(target, value) => void handleCopy(target, value)}
                    />
                )}

                <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                    {t("privacyNote")}
                </p>
            </CardContent>
        </Card>
    );
}
