"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { copyText } from "@/modules/tools/domain/clipboard";
import { saveBlob, saveFile } from "@/modules/tools/domain/file-saver";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import { createLink } from "@/modules/short-links/actions/create-link";
import type { ShortLinkCreatedView, ShortLinkFailureReason } from "@/modules/short-links/types";
import { renderSvgToPng } from "../domain/canvas";
import { DEFAULT_LOGO_SCALE, LOGO_FILE_LIMITS, MAX_PAYLOAD_LENGTH } from "../domain/constants";
import { encodeQr } from "../domain/encoder";
import { createQrSvgFile, buildQrFilename } from "../domain/export";
import { hasScannableContrast, resolveErrorLevel } from "../domain/options";
import { buildDraftText } from "../domain/payload";
import { renderQrSvg } from "../domain/render-svg";
import type { QrDraft, QrOptions, QrPayloadKind } from "../types";
import { QrDesignPanel } from "./qr-design-panel";
import { QrDynamicPanel } from "./qr-dynamic-panel";
import { QrPayloadFields } from "./qr-payload-fields";
import { QrPreview } from "./qr-preview";
import { QrReaderPanel } from "./qr-reader-panel";
import { QrTypeSelector } from "./qr-type-selector";

type QrWorkbenchProps = {
    initialKind: QrPayloadKind;
    initialDraft: QrDraft;
    initialOptions: QrOptions;
    /** Read on the server, so the island never reaches for `process.env`. */
    turnstileSiteKey: string | null;
    /** False when this deployment has nowhere to store a dynamic code. */
    dynamicStorageReady: boolean;
};

export function QrWorkbench({
    initialKind,
    initialDraft,
    initialOptions,
    turnstileSiteKey,
    dynamicStorageReady,
}: QrWorkbenchProps) {
    const t = useTranslations("qr.workbench");
    const tErrors = useTranslations("qr.errors");
    const tShortLinkErrors = useTranslations("shortLinks.errors");
    const tToast = useTranslations("qr.toast");

    const kindLabelId = useId();

    const [kind, setKind] = useState<QrPayloadKind>(initialKind);
    const [draft, setDraft] = useState<QrDraft>(initialDraft);
    const [options, setOptions] = useState<QrOptions>(initialOptions);
    const [downloading, setDownloading] = useState(false);

    const [dynamicEnabled, setDynamicEnabled] = useState(false);
    const [challengeToken, setChallengeToken] = useState<string | null>(null);
    const [challengeReset, setChallengeReset] = useState(0);
    const [created, setCreated] = useState<ShortLinkCreatedView | null>(null);
    const [creating, setCreating] = useState(false);
    const [dynamicFailure, setDynamicFailure] = useState<ShortLinkFailureReason | null>(null);

    // Only the typed value settles; presets, toggles and pickers are single
    // events and act straight away.
    const typed = buildDraftText(kind, draft);
    const settled = useDebouncedValue(typed);
    const pending = settled !== typed;

    // Once a dynamic code exists the symbol carries its short link, not the
    // destination — that indirection is the entire feature.
    const payload = created?.shortUrl ?? settled;
    const level = resolveErrorLevel(options);

    const encoded = payload.length === 0 ? null : encodeQr(payload, level);
    const matrix = encoded?.ok === true ? encoded.matrix : null;
    const svg = matrix === null ? null : renderQrSvg(matrix, options);

    const error =
        payload.length > MAX_PAYLOAD_LENGTH
            ? tErrors("tooLong", { limit: MAX_PAYLOAD_LENGTH })
            : encoded?.ok === false && encoded.reason === "too_long"
              ? tErrors("tooLong", { limit: MAX_PAYLOAD_LENGTH })
              : null;

    function patchDraft(patch: Partial<QrDraft>) {
        setDraft((current) => ({ ...current, ...patch }));
    }

    function patchOptions(patch: Partial<QrOptions>) {
        setOptions((current) => ({ ...current, ...patch }));
    }

    function handleKindChange(next: QrPayloadKind) {
        setKind(next);

        // A dynamic code is a redirect, and only a URL has somewhere to redirect
        // to. Switching away turns the offer off rather than leaving a control
        // enabled that could not work.
        if (next !== "url") {
            setDynamicEnabled(false);
            setDynamicFailure(null);
        }
    }

    async function handleLogoPick(file: File) {
        const checked = checkImageFile({ type: file.type, size: file.size }, LOGO_FILE_LIMITS);

        if (!checked.ok) {
            toast.error(tErrors(`logo.${checked.reason}`));

            return;
        }

        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();

                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(new Error("logo unreadable"));
                reader.readAsDataURL(file);
            });

            // A data URL rather than an object URL: the SVG has to stay
            // self-contained so a downloaded file still shows the logo, and so
            // the canvas that rasterises it is never tainted.
            patchOptions({ logo: { dataUrl, scale: options.logo?.scale ?? DEFAULT_LOGO_SCALE } });
        } catch (caught) {
            logEvent("error", "qr.logo_read_failed", { error: describeError(caught) });
            toast.error(tErrors("logo.unreadable"));
        }
    }

    async function handleDownloadPng() {
        if (matrix === null) {
            return;
        }

        setDownloading(true);

        try {
            const blob = await renderSvgToPng(
                renderQrSvg(matrix, options, { title: t("preview.alt") }),
                options.pixelSize,
            );

            if (blob === null) {
                toast.error(tToast("downloadFailed"));

                return;
            }

            const filename = buildQrFilename(kind, "png", new Date());

            saveBlob({ filename, blob });
            toast.success(tToast("downloaded", { filename }));
        } catch (caught) {
            logEvent("error", "qr.png_export_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        } finally {
            setDownloading(false);
        }
    }

    function handleDownloadSvg() {
        if (matrix === null) {
            return;
        }

        const file = createQrSvgFile({
            kind,
            svg: renderQrSvg(matrix, options, { title: t("preview.alt") }),
            generatedAt: new Date(),
        });

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (caught) {
            logEvent("error", "qr.svg_export_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    async function handleCopy(value: string) {
        const result = await copyText(value);

        toast[result.ok ? "success" : "error"](result.ok ? tToast("copied") : tToast("copyFailed"));
    }

    async function handleCreateDynamic() {
        if (challengeToken === null) {
            return;
        }

        setCreating(true);
        setDynamicFailure(null);

        try {
            const result = await createLink({
                tool: "qr",
                target: draft.url,
                alias: null,
                password: null,
                startsAt: null,
                expiresAt: null,
                token: challengeToken,
            });

            if (!result.ok) {
                setDynamicFailure(result.reason);

                return;
            }

            setCreated(result.value);
            toast.success(tToast("dynamicCreated"));
        } catch (caught) {
            logEvent("error", "qr.dynamic_create_failed", { error: describeError(caught) });
            setDynamicFailure("storage_unavailable");
        } finally {
            // A Turnstile token is single-use, so the widget is redrawn after
            // every attempt whether it succeeded or not.
            setChallengeToken(null);
            setChallengeReset((value) => value + 1);
            setCreating(false);
        }
    }

    const dynamicAvailable = dynamicStorageReady && turnstileSiteKey !== null;
    const lowContrast = !hasScannableContrast(options);

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

            <CardContent>
                <Tabs defaultValue="generate">
                    <TabsList className="w-full">
                        <TabsTrigger value="generate">{t("tabs.generate")}</TabsTrigger>
                        <TabsTrigger value="read">{t("tabs.read")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="generate" className="pt-4">
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-8">
                            <div className="flex min-w-0 flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                    <Label
                                        id={kindLabelId}
                                        className="text-muted-foreground text-xs"
                                    >
                                        <span className="leading-[1.3]">{t("kindLabel")}</span>
                                    </Label>
                                    <QrTypeSelector
                                        value={kind}
                                        labelId={kindLabelId}
                                        onChange={handleKindChange}
                                    />
                                </div>

                                <QrPayloadFields
                                    kind={kind}
                                    draft={draft}
                                    disabled={kind === "url" && created !== null}
                                    onChange={patchDraft}
                                />

                                {kind === "url" && created !== null && (
                                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                        {t("dynamicLocked")}
                                    </p>
                                )}

                                {kind === "url" && (
                                    <QrDynamicPanel
                                        enabled={dynamicEnabled}
                                        available={dynamicAvailable}
                                        siteKey={turnstileSiteKey}
                                        token={challengeToken}
                                        resetSignal={challengeReset}
                                        hasTarget={draft.url.trim().length > 0}
                                        created={created}
                                        creating={creating}
                                        error={
                                            dynamicFailure === null
                                                ? null
                                                : tShortLinkErrors(dynamicFailure)
                                        }
                                        onToggle={(next) => {
                                            setDynamicEnabled(next);
                                            setDynamicFailure(null);
                                        }}
                                        onVerify={setChallengeToken}
                                        onChallengeCleared={() => setChallengeToken(null)}
                                        onCreate={() => void handleCreateDynamic()}
                                        onCopy={(value) => void handleCopy(value)}
                                    />
                                )}

                                <QrDesignPanel
                                    options={options}
                                    lowContrast={lowContrast}
                                    onChange={patchOptions}
                                    onLogoPick={(file) => void handleLogoPick(file)}
                                />
                            </div>

                            <div className="min-w-0 lg:sticky lg:top-8 lg:self-start">
                                <QrPreview
                                    svg={svg}
                                    matrix={matrix}
                                    payloadLength={payload.length}
                                    error={error}
                                    pending={pending}
                                    downloading={downloading}
                                    onDownloadPng={() => void handleDownloadPng()}
                                    onDownloadSvg={handleDownloadSvg}
                                    onCopyPayload={() => void handleCopy(payload)}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="read" className="pt-4">
                        <QrReaderPanel />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
