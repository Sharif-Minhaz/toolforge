"use client";

import { IconLoader2, IconPhotoUp, IconScissors, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { ImageSourceControls } from "@/modules/tools/components/image-source-controls";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";
import { saveBlob } from "@/modules/tools/domain/file-saver";
import { loadImageElement } from "@/modules/tools/domain/image-element";
import { checkImageFile, normalizeImageType } from "@/modules/tools/domain/image-file";

import {
    isSameBackground,
    keepsTransparency,
    tabForBackground,
    TRANSPARENT_BACKGROUND,
} from "../domain/background";
import { applyMask, composeResult, loadCorsImage, toSegmentationInput } from "../domain/canvas";
import {
    CUTOUT_MODELS,
    IMAGE_ACCEPT_ATTRIBUTE,
    IMAGE_FILE_LIMITS,
    MAX_IMAGE_BYTES,
    MAX_SHEETS,
    RUNTIME_WASM_BYTES,
} from "../domain/constants";
import { buildCompositeFilename, defaultCompositeFormat, keepsAlpha } from "../domain/filenames";
import { computeAlphaMask, firstRunBytes, type CutoutProgress } from "../domain/removal";
import { nextSelectionAfterRemoval, planIntake, sheetId } from "../domain/sheets";
import {
    CUTOUT_QUALITIES,
    type BackgroundChoice,
    type BackgroundTab,
    type CompositeFormat,
    type CutoutFailureReason,
    type CutoutQuality,
    type SourceImageFacts,
} from "../types";
import { BackgroundPanel } from "./background-panel";
import { CompositeActions } from "./composite-actions";
import { CutoutStage } from "./cutout-stage";
import { SourceStrip, type StripEntry } from "./source-strip";

/**
 * One slot. Everything about one picture, and nothing about any other.
 *
 * That independence is the whole shape of this tool: `sheets` is a list of these
 * and every handler below reaches for exactly one of them by id. There is no
 * shared options object, no batch button and no "apply to all" — five people's
 * worth of separate work that happens to be open in one tab.
 */
type Sheet = {
    readonly id: string;
    readonly file: File;
    /** Object URL for the original. Revoked when the slot closes. */
    readonly sourceUrl: string;
    readonly element: HTMLImageElement;
    readonly facts: SourceImageFacts;
    readonly working: boolean;
    readonly failure: CutoutFailureReason | null;
    readonly progress: CutoutProgress | null;
    /** The model's alpha channel, decoded. `null` until the cut-out has run. */
    readonly mask: HTMLImageElement | null;
    readonly background: BackgroundChoice;
    readonly tab: BackgroundTab;
    readonly format: CompositeFormat;
    /** Whether the reader has chosen a format, or is still on the default. */
    readonly formatPinned: boolean;
    readonly composite: {
        readonly url: string;
        readonly blob: Blob;
        /** What it was made under, so staleness is derived rather than stored. */
        readonly background: BackgroundChoice;
        readonly format: CompositeFormat;
    } | null;
};

type BackgroundRemoverWorkbenchProps = {
    /** Whether this deployment can search Pexels at all. Resolved on the server. */
    readonly searchEnabled: boolean;
    readonly urlImportEnabled: boolean;
    readonly initialQuality: CutoutQuality;
    readonly initialTab: BackgroundTab;
    readonly initialQuery: string;
};

export function BackgroundRemoverWorkbench({
    searchEnabled,
    urlImportEnabled,
    initialQuality,
    initialTab,
    initialQuery,
}: BackgroundRemoverWorkbenchProps) {
    const t = useTranslations("backgroundRemover.workbench");
    const tErrors = useTranslations("backgroundRemover.errors");
    const tToast = useTranslations("backgroundRemover.toast");
    const tQualities = useTranslations("backgroundRemover.qualities");
    const byteLabel = useByteLabel();

    const inputId = useId();
    const hintId = useId();

    const [sheets, setSheets] = useState<readonly Sheet[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [quality, setQuality] = useState<CutoutQuality>(initialQuality);
    const [dragging, setDragging] = useState(false);
    const { ref: resultRef, scrollToResult } = useResultScroll();

    /**
     * A counter rather than randomness or a clock. Slot ids become React keys,
     * and a value drawn from entropy during render is the hydration bug
     * `docs/hydration-and-platform-pitfalls.md` opens with.
     */
    const sequence = useRef(0);

    /**
     * Object URLs this component created and has not handed to a slot yet — the
     * backgrounds a reader uploaded. Slot URLs are revoked when the slot closes;
     * these have no slot to hang from, so they are revoked on unmount.
     */
    const ownedUrls = useRef<string[]>([]);

    /**
     * Every object URL a slot currently holds.
     *
     * Kept in a ref written from an effect rather than assigned during render:
     * a render is allowed to run and be thrown away, and a URL list built during
     * one of those would send the unmount cleanup after handles that were never
     * live. This is only ever read by that cleanup.
     */
    const liveUrls = useRef<readonly string[]>([]);

    useEffect(() => {
        liveUrls.current = sheets.flatMap((sheet) =>
            sheet.composite === null ? [sheet.sourceUrl] : [sheet.sourceUrl, sheet.composite.url],
        );
    }, [sheets]);

    // Revoking on the way out rather than at each exit: the cleanup fires
    // whether the reader navigates away, closes the tab's route or the island
    // unmounts, so there is one rule instead of one per path.
    useEffect(() => {
        const owned = ownedUrls;
        const live = liveUrls;

        return () => {
            for (const url of [...owned.current, ...live.current]) {
                URL.revokeObjectURL(url);
            }
        };
    }, []);

    const selected = sheets.find((sheet) => sheet.id === selectedId) ?? null;
    const busy = sheets.some((sheet) => sheet.working);

    /**
     * Whether the composite on screen still answers the controls under it.
     *
     * Derived from what it was made with rather than stored as a flag, which is
     * the rule the image codecs' case study arrived at: a `isStale` boolean is
     * one more thing to keep in step, and the one that goes wrong is always the
     * clearing of it.
     */
    const stale =
        selected?.composite != null &&
        (!isSameBackground(selected.composite.background, selected.background) ||
            selected.composite.format !== selected.format);

    function patchSheet(id: string, patch: (sheet: Sheet) => Sheet) {
        setSheets((current) => current.map((sheet) => (sheet.id === id ? patch(sheet) : sheet)));
    }

    function describeFailure(reason: CutoutFailureReason): string {
        switch (reason) {
            case "too_large":
                return tErrors("too_large", { limit: byteLabel(MAX_IMAGE_BYTES) });
            case "empty_file":
                return tErrors("empty_file");
            case "unsupported_type":
                return tErrors("unsupported_type");
            case "undecodable_image":
                return tErrors("undecodable_image");
            case "model_unavailable":
                return tErrors("model_unavailable");
            case "removal_failed":
                return tErrors("removal_failed");
            case "compose_failed":
                return tErrors("compose_failed");
        }
    }

    async function handleFiles(files: readonly File[]) {
        if (files.length === 0) {
            return;
        }

        const plan = planIntake(sheets.length, files.length);

        if (plan.rejected > 0) {
            toast.warning(tToast("slotsFull", { count: plan.rejected, max: MAX_SHEETS }));
        }

        for (const file of files.slice(0, plan.accepted)) {
            const check = checkImageFile(file, IMAGE_FILE_LIMITS);

            if (!check.ok) {
                toast.error(describeFailure(check.reason));

                continue;
            }

            const url = URL.createObjectURL(file);
            const element = await loadImageElement(url);

            if (element === null) {
                // Nothing can be cut out of a picture the browser will not
                // decode, so this is refused here rather than at the model.
                URL.revokeObjectURL(url);
                toast.error(describeFailure("undecodable_image"));

                continue;
            }

            sequence.current += 1;

            const id = sheetId(sequence.current);

            setSheets((current) => [
                ...current,
                {
                    id,
                    file,
                    sourceUrl: url,
                    element,
                    facts: {
                        name: file.name,
                        type: normalizeImageType(file.type),
                        bytes: file.size,
                        width: element.naturalWidth,
                        height: element.naturalHeight,
                    },
                    working: false,
                    failure: null,
                    progress: null,
                    mask: null,
                    background: TRANSPARENT_BACKGROUND,
                    tab: initialTab,
                    format: defaultCompositeFormat(TRANSPARENT_BACKGROUND),
                    formatPinned: false,
                    composite: null,
                },
            ]);
            setSelectedId(id);
        }
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);
        void handleFiles([...event.dataTransfer.files]);
    }

    function handleRemoveSheet(id: string) {
        const sheet = sheets.find((candidate) => candidate.id === id);

        if (sheet === undefined) {
            return;
        }

        URL.revokeObjectURL(sheet.sourceUrl);

        if (sheet.composite !== null) {
            URL.revokeObjectURL(sheet.composite.url);
        }

        setSelectedId((current) =>
            current === null
                ? null
                : nextSelectionAfterRemoval(
                      sheets.map((candidate) => candidate.id),
                      id,
                      current,
                  ),
        );
        setSheets((current) => current.filter((candidate) => candidate.id !== id));
    }

    function handleClearAll() {
        for (const url of liveUrls.current) {
            URL.revokeObjectURL(url);
        }

        setSheets([]);
        setSelectedId(null);
    }

    /**
     * Runs the model on one slot, then composites whatever background it is on.
     *
     * Sequential by construction rather than by a queue: the button belongs to
     * the open slot and there is only ever one open. Running five at once would
     * hold five decoded bitmaps and five model sessions simultaneously, which is
     * how a tab dies halfway through — the same rule the image codecs' batch
     * queue records, arrived at from the other direction.
     */
    async function handleRemoveBackground(sheet: Sheet) {
        patchSheet(sheet.id, (current) => ({
            ...current,
            working: true,
            failure: null,
            progress: { phase: "download", ratio: 0 },
        }));

        try {
            const input = await toSegmentationInput(sheet.element, sheet.facts);

            if (input === null) {
                fail(sheet.id, "compose_failed");

                return;
            }

            const result = await computeAlphaMask(input, quality, (progress) =>
                patchSheet(sheet.id, (current) => ({ ...current, progress })),
            );

            if (!result.ok) {
                // The library's own message goes in the log beside the reason.
                // Without it a failure in somebody's browser reports only
                // `removal_failed`, which names the symptom and hides the cause.
                logEvent("warn", "background_remover.cutout_failed", {
                    reason: result.reason,
                    detail: result.detail,
                });
                fail(sheet.id, result.reason);

                return;
            }

            const maskUrl = URL.createObjectURL(result.mask);
            const mask = await loadImageElement(maskUrl);

            URL.revokeObjectURL(maskUrl);

            if (mask === null) {
                logEvent("error", "background_remover.mask_undecodable");
                fail(sheet.id, "compose_failed");

                return;
            }

            patchSheet(sheet.id, (current) => ({ ...current, mask, progress: null }));

            await composeInto(sheet.id, { ...sheet, mask }, sheet.background, sheet.format);
            scrollToResult();
            toast.success(tToast("removed"));
        } catch (caught) {
            logEvent("error", "background_remover.cutout_threw", { error: describeError(caught) });
            fail(sheet.id, "removal_failed");
        } finally {
            patchSheet(sheet.id, (current) => ({ ...current, working: false, progress: null }));
        }
    }

    function fail(id: string, reason: CutoutFailureReason) {
        patchSheet(id, (current) => ({ ...current, failure: reason, progress: null }));
        toast.error(describeFailure(reason));
    }

    /**
     * Redraws one slot's composite.
     *
     * The mask is already in hand, so this never touches the model — changing a
     * background is a canvas redraw measured in milliseconds, which is why the
     * pickers apply immediately instead of behind an "apply" button.
     */
    async function composeInto(
        id: string,
        sheet: Sheet,
        background: BackgroundChoice,
        format: CompositeFormat,
    ) {
        if (sheet.mask === null) {
            return;
        }

        const backgroundImage =
            background.kind === "image" ? await loadCorsImage(background.url) : null;

        if (background.kind === "image" && backgroundImage === null) {
            fail(id, "compose_failed");

            return;
        }

        const cutout = applyMask(sheet.element, sheet.mask, sheet.facts);

        if (cutout === null) {
            fail(id, "compose_failed");

            return;
        }

        const blob = await composeResult({
            source: sheet.element,
            size: sheet.facts,
            cutout,
            background,
            backgroundImage,
            format,
        });

        if (blob === null) {
            logEvent("error", "background_remover.compose_failed");
            fail(id, "compose_failed");

            return;
        }

        // Minted outside the updater, deliberately. React may run a state
        // updater more than once for the same commit — Strict Mode does it on
        // every render — and `createObjectURL` inside one would hand out a
        // second handle that nothing ever revokes. The `revoke` below is safe in
        // there because revoking a handle twice is a no-op.
        const url = URL.createObjectURL(blob);

        patchSheet(id, (current) => {
            if (current.composite !== null) {
                URL.revokeObjectURL(current.composite.url);
            }

            return { ...current, failure: null, composite: { url, blob, background, format } };
        });
    }

    function handleBackgroundChange(sheet: Sheet, background: BackgroundChoice) {
        const format = sheet.formatPinned ? sheet.format : defaultCompositeFormat(background);

        patchSheet(sheet.id, (current) => ({
            ...current,
            background,
            format,
            tab: tabForBackground(background),
        }));

        if (sheet.mask !== null) {
            void composeInto(sheet.id, sheet, background, format);
        }
    }

    function handleFormatChange(sheet: Sheet, format: CompositeFormat) {
        patchSheet(sheet.id, (current) => ({ ...current, format, formatPinned: true }));

        if (sheet.mask !== null) {
            void composeInto(sheet.id, sheet, sheet.background, format);
        }
    }

    function handleUploadBackground(sheet: Sheet, file: File) {
        const check = checkImageFile(file, IMAGE_FILE_LIMITS);

        if (!check.ok) {
            toast.error(describeFailure(check.reason));

            return;
        }

        const url = URL.createObjectURL(file);

        ownedUrls.current = [...ownedUrls.current, url];

        handleBackgroundChange(sheet, {
            kind: "image",
            url,
            // A file of the reader's own carries no credit, and inventing one
            // would be a lie in the copy under the result.
            credit: null,
            description: file.name,
        });
    }

    function handleDownload(sheet: Sheet) {
        if (sheet.composite === null) {
            return;
        }

        const download = {
            filename: buildCompositeFilename(
                sheet.facts.name,
                sheet.composite.background,
                sheet.composite.format,
            ),
            blob: sheet.composite.blob,
        };

        try {
            saveBlob(download);
            toast.success(tToast("downloaded", { filename: download.filename }));
        } catch (caught) {
            logEvent("error", "background_remover.download_failed", {
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (selected === null) {
            return {
                tone: "idle",
                message: t("pickPrompt", { limit: byteLabel(MAX_IMAGE_BYTES) }),
            };
        }

        if (selected.working) {
            return {
                tone: "pending",
                message:
                    selected.progress?.phase === "download"
                        ? t("downloadingModel")
                        : t("computing"),
            };
        }

        if (selected.failure !== null) {
            return { tone: "error", message: describeFailure(selected.failure) };
        }

        if (selected.mask === null) {
            return { tone: "idle", message: t("readyToRemove") };
        }

        return stale
            ? { tone: "warning", message: t("resultStale") }
            : { tone: "success", message: t("cutoutReady") };
    }

    const entries: StripEntry[] = sheets.map((sheet) => ({
        id: sheet.id,
        name: sheet.facts.name,
        thumbnailUrl: sheet.composite?.url ?? sheet.sourceUrl,
        state: sheet.working
            ? "working"
            : sheet.failure !== null
              ? "failed"
              : sheet.mask !== null
                ? "ready"
                : "idle",
    }));

    const status = describeStatus();
    const downloadSize = byteLabel(firstRunBytes(quality, RUNTIME_WASM_BYTES.gpu));

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
                <div className="flex min-w-0 flex-col gap-2">
                    {sheets.length === 0 && (
                        <>
                            <input
                                id={inputId}
                                type="file"
                                accept={IMAGE_ACCEPT_ATTRIBUTE}
                                multiple
                                aria-describedby={hintId}
                                onChange={(event) => {
                                    void handleFiles([...(event.target.files ?? [])]);
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
                                    "border-border/80 bg-card/40 hover:border-primary/50 peer-focus-visible:ring-ring flex min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center transition-colors duration-200 peer-focus-visible:ring-2",
                                    dragging &&
                                        "border-primary/70 bg-[color-mix(in_oklch,var(--primary)_6%,transparent)]",
                                )}
                            >
                                <IconPhotoUp
                                    className="text-muted-foreground size-7"
                                    stroke={1.6}
                                    aria-hidden="true"
                                />
                                <span className="text-[0.9375rem] leading-[1.4] font-medium">
                                    {t("dropTitle")}
                                </span>
                                <span className="text-muted-foreground text-[0.8125rem] leading-normal">
                                    {t("dropHint", {
                                        limit: byteLabel(MAX_IMAGE_BYTES),
                                        max: MAX_SHEETS,
                                    })}
                                </span>
                            </label>
                        </>
                    )}

                    {/*
                     * Rendered whatever is open, not only on the empty state.
                     * The paste handler lives inside it, and hiding the whole row
                     * once a picture is chosen would silently take Ctrl+V away
                     * for the second one — which is exactly how somebody adds a
                     * screenshot to a strip they already started.
                     */}
                    {sheets.length < MAX_SHEETS && (
                        <ImageSourceControls
                            onFiles={(files) => void handleFiles(files)}
                            disabled={busy}
                            urlImportEnabled={urlImportEnabled}
                        />
                    )}

                    {selected === null && (
                        <StatusStrip id={hintId} tone={status.tone} message={status.message} />
                    )}
                </div>

                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <OptionSelect
                        label={t("quality")}
                        hint={t("qualityHint", { size: downloadSize })}
                        value={quality}
                        disabled={busy}
                        items={Object.fromEntries(
                            CUTOUT_QUALITIES.map((name) => [
                                name,
                                tQualities(name, {
                                    size: byteLabel(CUTOUT_MODELS[name].bytes),
                                }),
                            ]),
                        )}
                        values={CUTOUT_QUALITIES}
                        onChange={setQuality}
                    />
                </div>

                {/*
                 * Picture on the left, background picker on the right, strip
                 * underneath both — rather than one long column.
                 *
                 * The two are worth putting side by side because they are used
                 * *together*: every press in the picker changes the picture, and
                 * stacked vertically the effect of a swatch happens off-screen
                 * above the thing you just pressed. Both panels are given their
                 * own scroll instead of growing, so the picture stays put while
                 * a hundred stock thumbnails go past beside it.
                 *
                 * One column below `lg`, where there is no room for two and the
                 * reading order — see it, then change it — is the right one.
                 */}
                {selected !== null && (
                    <div
                        ref={resultRef}
                        className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]"
                    >
                        <div className="flex min-w-0 flex-col gap-3">
                            <CutoutStage
                                key={selected.id}
                                facts={selected.facts}
                                sourceUrl={selected.sourceUrl}
                                compositeUrl={selected.composite?.url ?? null}
                                // Read off the *composite*, not off the controls:
                                // a JPEG of a transparent cut-out has already been
                                // flattened onto white, and a checkerboard under
                                // it would claim a transparency the file does not
                                // have.
                                checkered={
                                    selected.composite === null
                                        ? keepsTransparency(selected.background)
                                        : keepsTransparency(selected.composite.background) &&
                                          keepsAlpha(selected.composite.format)
                                }
                                progress={selected.progress}
                                stale={stale}
                                credit={
                                    selected.composite?.background.kind === "image"
                                        ? selected.composite.background.credit
                                        : null
                                }
                            />

                            <StatusStrip tone={status.tone} message={status.message} />

                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Button
                                    onClick={() => void handleRemoveBackground(selected)}
                                    disabled={selected.working}
                                    className="h-9 px-3.5"
                                >
                                    {selected.working ? (
                                        <IconLoader2
                                            className="size-4 animate-spin"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <IconScissors
                                            className="size-4"
                                            stroke={1.9}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {selected.working
                                        ? t("working")
                                        : selected.mask === null
                                          ? t("remove")
                                          : t("removeAgain")}
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={handleClearAll}
                                    disabled={busy}
                                    className="h-9 px-3.5"
                                >
                                    <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                                    {t("clearAll")}
                                </Button>
                            </div>

                            {selected.composite !== null && (
                                <CompositeActions
                                    facts={selected.facts}
                                    resultBytes={selected.composite.blob.size}
                                    background={selected.composite.background}
                                    format={selected.format}
                                    busy={selected.working}
                                    onFormatChange={(format) =>
                                        handleFormatChange(selected, format)
                                    }
                                    onDownload={() => handleDownload(selected)}
                                />
                            )}
                        </div>

                        <BackgroundPanel
                            tab={selected.tab}
                            onTabChange={(tab) =>
                                patchSheet(selected.id, (current) => ({ ...current, tab }))
                            }
                            value={selected.background}
                            size={selected.facts}
                            unlocked={selected.mask !== null}
                            busy={selected.working}
                            searchEnabled={searchEnabled}
                            initialQuery={initialQuery}
                            onChange={(background) => handleBackgroundChange(selected, background)}
                            onUpload={(file) => handleUploadBackground(selected, file)}
                            // Sticky on a wide screen so the picker stays beside
                            // the picture while the page scrolls past the article
                            // underneath. `top-24` clears the sticky header.
                            className="lg:sticky lg:top-24"
                        />
                    </div>
                )}

                {sheets.length > 0 && (
                    <SourceStrip
                        entries={entries}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onRemove={handleRemoveSheet}
                        onAdd={(files) => void handleFiles(files)}
                        accept={IMAGE_ACCEPT_ATTRIBUTE}
                        disabled={busy}
                    />
                )}

                <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                    {t("privacyNote")}
                </p>
            </CardContent>
        </Card>
    );
}
