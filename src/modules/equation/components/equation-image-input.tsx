"use client";

import { IconLoader2, IconPhotoUp, IconScan, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { ImageSourceControls } from "@/modules/tools/components/image-source-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";

import { recognizeEquations } from "../actions/recognize-equations";
import {
    EQUATION_IMAGE_ACCEPT,
    IMAGE_FORM_FIELD,
    MAX_EQUATION_IMAGE_BYTES,
    TOKEN_FORM_FIELD,
    TURNSTILE_ACTION,
} from "../domain/constants";
import { checkEquationImage } from "../domain/recognition";
import type { PickedImage, RecognitionFailureReason, RecognitionResult } from "../types";

type EquationImageInputProps = {
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent, which disables reading. */
    siteKey: string | null;
    /** Whether this deployment has a recognizer worker and a key for it. */
    configured: boolean;
    /**
     * Owned by the workbench rather than here, because a picture can now arrive
     * while this panel is not on screen — pasting one from the Text tab is what
     * switches to this tab in the first place. One owner means one object URL
     * and one place that revokes it.
     */
    picked: PickedImage | null;
    onPick: (file: File | undefined) => void;
    onRemove: () => void;
    onResult: (result: RecognitionResult) => void;
};

/**
 * The picture half of the tool: pick, drop or paste an image, solve the
 * challenge, and send it to be read.
 *
 * Kept apart from the workbench because it is the only part of this tool that
 * leaves the browser, and the separation is the point — everything below it
 * consumes `ConvertedEquation[]` and cannot tell where an equation came from.
 * Swapping the recognizer means editing `repository/math-ocr.ts` and this
 * component's action call, and nothing else.
 *
 * The disclosure sits above the controls rather than in the article, because
 * this is where the site's "nothing is uploaded" promise stops holding and a
 * reader has to be told before they choose a file, not after.
 */
export function EquationImageInput({
    siteKey,
    configured,
    picked,
    onPick,
    onRemove,
    onResult,
}: EquationImageInputProps) {
    const t = useTranslations("equation.image");
    const tErrors = useTranslations("equation.errors");
    const byteLabel = useByteLabel();

    const inputId = useId();
    const statusId = useId();

    const [dragging, setDragging] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [challengeFailed, setChallengeFailed] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);
    const [reading, setReading] = useState(false);
    const [failure, setFailure] = useState<RecognitionFailureReason | null>(null);

    const challengeReady = token !== null;
    const checked = picked === null ? null : checkEquationImage(picked.file);
    const canRead = configured && siteKey !== null && challengeReady && checked?.ok === true;

    function describeFailure(reason: RecognitionFailureReason): string {
        return reason === "too_large"
            ? tErrors("too_large", { limit: byteLabel(MAX_EQUATION_IMAGE_BYTES) })
            : tErrors(reason);
    }

    function describeStatus(): { tone: StatusTone; message: string } {
        if (!configured) {
            return { tone: "error", message: describeFailure("not_configured") };
        }

        if (siteKey === null) {
            return { tone: "error", message: tErrors("challenge_required") };
        }

        if (reading) {
            return { tone: "pending", message: t("reading") };
        }

        if (failure !== null) {
            return { tone: "error", message: describeFailure(failure) };
        }

        if (checked === null) {
            return {
                tone: "idle",
                message: t("pickPrompt", { limit: byteLabel(MAX_EQUATION_IMAGE_BYTES) }),
            };
        }

        if (!checked.ok) {
            return { tone: "error", message: describeFailure(checked.reason) };
        }

        if (challengeFailed) {
            return { tone: "warning", message: t("challengeFailed") };
        }

        return challengeReady
            ? { tone: "success", message: t("ready") }
            : { tone: "pending", message: t("challengePending") };
    }

    /** A Turnstile token is single-use, so every attempt draws a fresh one. */
    function renewChallenge() {
        setToken(null);
        setResetSignal((current) => current + 1);
    }

    function handlePick(file: File | undefined) {
        if (file === undefined || reading) {
            return;
        }

        setFailure(null);
        onPick(file);
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setDragging(false);
        handlePick(event.dataTransfer.files[0]);
    }

    function handleRemove() {
        setFailure(null);
        onRemove();
    }

    async function handleRead() {
        if (reading || !canRead || picked === null || token === null) {
            return;
        }

        setReading(true);
        setFailure(null);

        const body = new FormData();

        body.set(IMAGE_FORM_FIELD, picked.file, picked.file.name);
        body.set(TOKEN_FORM_FIELD, token);

        try {
            const result = await recognizeEquations(body);

            if (!result.ok) {
                setFailure(result.reason);
                logEvent("warn", "equation.recognition_failed", { reason: result.reason });
            }

            onResult(result);
        } catch (caught) {
            setFailure("upstream_unavailable");
            logEvent("error", "equation.recognition_threw", { error: describeError(caught) });
            onResult({ ok: false, reason: "upstream_unavailable" });
        } finally {
            setReading(false);
            renewChallenge();
        }
    }

    const status = describeStatus();

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {/* Above the controls, never in the article: this is the one path in
                this tool that sends what the reader chose to a server. */}
            <p className="text-muted-foreground bg-muted/50 ring-border/60 rounded-xl px-3 py-2 text-[0.75rem] leading-[1.5] ring-1 ring-inset">
                {t("disclosure")}
            </p>

            <div className="flex min-w-0 flex-col gap-2">
                <input
                    id={inputId}
                    type="file"
                    accept={EQUATION_IMAGE_ACCEPT}
                    disabled={reading}
                    aria-describedby={statusId}
                    onChange={(event) => handlePick(event.target.files?.[0])}
                    // Focusable but not laid out, so the label below can be the
                    // whole target while the keyboard still reaches it.
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
                    <IconPhotoUp
                        className="text-muted-foreground size-7"
                        stroke={1.6}
                        aria-hidden="true"
                    />
                    <span className="text-[0.9375rem] leading-[1.4] font-medium">
                        {picked === null ? t("dropTitle") : t("replaceTitle")}
                    </span>
                    <span className="text-muted-foreground text-[0.8125rem] leading-[1.5]">
                        {t("dropHint", { limit: byteLabel(MAX_EQUATION_IMAGE_BYTES) })}
                    </span>
                </label>

                {/* The URL row is deliberately off: this tool takes a file, a
                    drop or a paste. Fetching somebody's address is a metered
                    outbound request the image tools own, and not something an
                    equation reader needs.

                    Its Ctrl+V listener is the one that runs while this tab is
                    up; the workbench binds its own for the Text tab, and the two
                    are mutually exclusive so a paste is never handled twice. */}
                <ImageSourceControls
                    onFiles={(files) => handlePick(files[0])}
                    disabled={reading}
                    urlImportEnabled={false}
                />
            </div>

            {picked !== null && (
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
                    {/*
                     * A plain `<img>`, deliberately: the source is an object URL
                     * for a file the reader just chose, so there is no origin to
                     * allowlist and nothing for `next/image` to optimise.
                     */}
                    <img
                        src={picked.url}
                        alt={t("previewAlt", { name: picked.file.name })}
                        decoding="async"
                        className="ring-border/70 bg-muted/40 h-36 w-full shrink-0 rounded-xl object-contain ring-1 ring-inset sm:w-52"
                    />

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <p className="truncate font-mono text-[0.8125rem]">{picked.file.name}</p>
                        <p className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                            {byteLabel(picked.file.size)}
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={reading}
                            onClick={handleRemove}
                            className="self-start"
                        >
                            <IconTrash className="size-3.5" stroke={1.8} aria-hidden="true" />
                            {t("remove")}
                        </Button>
                    </div>
                </div>
            )}

            {siteKey !== null && (
                // Reserves the widget's height so the button below does not jump
                // once Cloudflare's script finishes loading.
                <div className="min-h-16 w-full max-w-82 min-w-0">
                    <TurnstileWidget
                        siteKey={siteKey}
                        action={TURNSTILE_ACTION}
                        resetSignal={resetSignal}
                        onVerify={(verified) => {
                            setChallengeFailed(false);
                            setToken(verified);
                        }}
                        onExpire={() => setToken(null)}
                        onError={() => {
                            setChallengeFailed(true);
                            setToken(null);
                        }}
                    />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void handleRead()} disabled={!canRead || reading}>
                    {reading ? (
                        <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <IconScan className="size-4" stroke={1.8} aria-hidden="true" />
                    )}
                    {reading ? t("reading") : t("read")}
                </Button>
            </div>

            <StatusStrip id={statusId} tone={status.tone} message={status.message} />
        </div>
    );
}
