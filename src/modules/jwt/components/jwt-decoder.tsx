"use client";

import { IconDownload, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { getKeyFormat, isUnsecuredAlgorithm, resolveExpectedAlgorithm } from "../domain/algorithms";
import { buildHeaderRows, buildPayloadRows } from "../domain/claims";
import { DEFAULT_JWT_ALGORITHM } from "../domain/constants";
import { decodeJwt } from "../domain/decode";
import { buildDecodedDocument, createJwtExportFile } from "../domain/export";
import type { JwtExample } from "../domain/examples";
import { inspectSecurity } from "../domain/security";
import { verifyJwtSignature } from "../domain/verify";
import type { JwtAlgorithm, JwtDecodeFailure, JwtKeyInput, JwtVerifyResult } from "../types";
import { AlgorithmSelect } from "./algorithm-select";
import { HeaderClaimsTable, PayloadClaimsTable } from "./claims-table";
import { ExampleGenerator } from "./example-generator";
import { JsonBox } from "./json-box";
import { KeyField } from "./key-field";
import { SecurityFindings } from "./security-findings";
import { SegmentChips } from "./token-segments";
import { ViewToggle, type DecodedView } from "./view-toggle";

/** How often the relative claim labels catch up with the wall clock. */
const CLOCK_TICK_MS = 15_000;

type CopyPanel = "token" | "header" | "payload" | "key";

const EMPTY_SECRET: JwtKeyInput = { kind: "secret", secret: "", base64url: false };
const EMPTY_PEM: JwtKeyInput = { kind: "pem", pem: "" };

function toKeyInput(algorithm: JwtAlgorithm, material: string): JwtKeyInput {
    return getKeyFormat(algorithm) === "secret"
        ? { kind: "secret", secret: material, base64url: false }
        : { kind: "pem", pem: material };
}

type JwtDecoderProps = {
    /** Server-rendered instant, so claim states hydrate without a mismatch. */
    initialNow: string;
    /** Signed on the server, so the first paint is a worked example. */
    example: JwtExample | null;
};

export function JwtDecoder({ initialNow, example }: JwtDecoderProps) {
    const t = useTranslations("jwt.workbench");
    const tDecoder = useTranslations("jwt.workbench.decoder");
    const tErrors = useTranslations("jwt.errors");
    const tToast = useTranslations("jwt.toast");

    const tokenId = useId();
    const headerId = useId();
    const payloadId = useId();
    const viewLabelId = useId();
    const algorithmLabelId = useId();

    const [token, setToken] = useState(example?.token ?? "");
    const [view, setView] = useState<DecodedView>("json");
    const [algorithmOverride, setAlgorithmOverride] = useState<JwtAlgorithm | null>(null);
    const [keyInput, setKeyInput] = useState<JwtKeyInput>(
        example === null ? EMPTY_SECRET : toKeyInput(example.algorithm, example.verificationKey),
    );
    const [verified, setVerified] = useState<{ key: string; result: JwtVerifyResult } | null>(null);
    const [copied, setCopied] = useCopyFeedback<CopyPanel>();
    const [now, setNow] = useState(() => new Date(initialNow));

    // Relative labels ("expires in 2 hours") go stale on a page left open, and a
    // token that expires while it is on screen should start saying so.
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS);

        return () => window.clearInterval(timer);
    }, []);

    const settledToken = useDebouncedValue(token);
    const settledKey = useDebouncedValue(keyInput);
    const pending = settledToken !== token;

    // Pure and deterministic, so the server-rendered pass already carries the
    // result and hydration has nothing to reconcile.
    const decoded = decodeJwt(settledToken);
    const headerAlgorithm = decoded.ok ? decoded.algorithm : null;
    const expectedAlgorithm = resolveExpectedAlgorithm(
        algorithmOverride,
        headerAlgorithm,
        DEFAULT_JWT_ALGORITHM,
    );
    const unsecured = isUnsecuredAlgorithm(headerAlgorithm);
    const algorithmDiffers = headerAlgorithm !== null && headerAlgorithm !== expectedAlgorithm;

    const keyMaterial = settledKey.kind === "secret" ? settledKey.secret : settledKey.pem;
    const decodedToken = decoded.ok ? decoded.token : null;
    const hasKey = keyMaterial.trim().length > 0;
    const shouldVerify = decodedToken !== null && hasKey && !unsecured;
    // Identity of one verification request. The stored result is only shown
    // while it still answers the question currently on screen, which is what
    // keeps an in-flight check from reporting on a token already replaced.
    const requestKey = shouldVerify
        ? JSON.stringify([decodedToken, expectedAlgorithm, settledKey])
        : null;

    useEffect(() => {
        if (requestKey === null || decodedToken === null) {
            return;
        }

        let cancelled = false;

        void verifyJwtSignature({
            token: decodedToken,
            algorithm: expectedAlgorithm,
            key: settledKey,
        }).then((result) => {
            if (!cancelled) {
                setVerified({ key: requestKey, result });
            }
        });

        return () => {
            cancelled = true;
        };
    }, [requestKey, decodedToken, expectedAlgorithm, settledKey]);

    const verification = verified?.key === requestKey ? verified.result : null;
    const verifying = requestKey !== null && verification === null;

    function describeDecodeFailure(failure: JwtDecodeFailure): string {
        return tErrors(`decode.${failure.reason}`, {
            segment: failure.segment === undefined ? "" : t(`segments.${failure.segment}`),
            count: failure.segmentCount ?? 0,
        });
    }

    const tokenStatus: { tone: StatusTone; message: string } = decoded.ok
        ? { tone: "success", message: tDecoder("validToken") }
        : decoded.reason === "empty"
          ? { tone: "idle", message: tDecoder("awaitingToken") }
          : { tone: "error", message: describeDecodeFailure(decoded) };

    function describeVerification(): { tone: StatusTone; message: string } {
        if (unsecured) {
            return { tone: "error", message: tDecoder("unsignedToken") };
        }

        if (decodedToken === null) {
            return { tone: "idle", message: tDecoder("awaitingToken") };
        }

        if (!hasKey) {
            return { tone: "idle", message: tDecoder("awaitingKey") };
        }

        if (verifying || verification === null) {
            return { tone: "pending", message: tDecoder("verifying") };
        }

        return verification.ok
            ? { tone: "success", message: tDecoder("verified", { algorithm: expectedAlgorithm }) }
            : { tone: "error", message: tErrors(`verify.${verification.reason}`) };
    }

    const verifyStatus = describeVerification();

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
        if (!decoded.ok) {
            return;
        }

        const file = createJwtExportFile({
            mode: "decode",
            content: buildDecodedDocument(decoded),
            generatedAt: new Date(),
        });

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (caught) {
            logEvent("error", "jwt.download_failed", {
                mode: "decode",
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    function handleAlgorithmChange(next: JwtAlgorithm) {
        setAlgorithmOverride(next);

        // Swapping family swaps the key box, so a secret is never left sitting
        // where a PEM block belongs.
        if (getKeyFormat(next) !== getKeyFormat(expectedAlgorithm)) {
            setKeyInput(getKeyFormat(next) === "secret" ? EMPTY_SECRET : EMPTY_PEM);
        }
    }

    function handleExample(next: JwtExample) {
        setToken(next.token);
        setAlgorithmOverride(null);
        setKeyInput(toKeyInput(next.algorithm, next.verificationKey));
    }

    const headerJson = decoded.ok ? decoded.headerJson : "";
    const payloadJson = decoded.ok ? decoded.payloadJson : "";

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-muted-foreground max-w-md text-[0.8125rem] leading-normal">
                    {tDecoder("description")}
                </p>
                <ExampleGenerator onGenerate={handleExample} />
            </div>

            <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:gap-6">
                <div className="flex min-w-0 flex-col gap-4">
                    <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor={tokenId} className="text-muted-foreground text-xs">
                                <span className="leading-[1.3]">{tDecoder("tokenLabel")}</span>
                            </Label>
                            <div className="flex items-center gap-1">
                                <IconCopyButton
                                    copied={copied === "token"}
                                    onClick={() => void handleCopy("token", token)}
                                    aria-label={tDecoder("copyToken")}
                                />
                                <button
                                    type="button"
                                    onClick={() => setToken("")}
                                    disabled={token.length === 0}
                                    aria-label={tDecoder("clear")}
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
                            id={tokenId}
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                            placeholder={tDecoder("tokenPlaceholder")}
                            spellCheck={false}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            className="bg-background/60 max-h-72 min-h-36 resize-y rounded-lg font-mono text-[0.8125rem] leading-6 break-all"
                        />

                        {decoded.ok && <SegmentChips segments={decoded.segments} />}

                        <StatusStrip
                            tone={tokenStatus.tone}
                            message={tokenStatus.message}
                            className={cn(
                                "transition-opacity duration-200",
                                pending && "opacity-55",
                            )}
                        />
                    </div>

                    <section className="flex min-w-0 flex-col gap-2">
                        <h3 className="text-[0.8125rem] leading-[1.3] font-medium">
                            {tDecoder("findingsTitle")}
                        </h3>
                        <SecurityFindings
                            findings={decoded.ok ? inspectSecurity(decoded, now) : []}
                        />
                        <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                            {tDecoder("notEncryptedNote")}
                        </p>
                    </section>
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span id={viewLabelId} className="text-muted-foreground text-xs">
                            {tDecoder("decodedLabel")}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <ViewToggle value={view} onChange={setView} labelId={viewLabelId} />
                            <button
                                type="button"
                                onClick={handleDownload}
                                disabled={!decoded.ok}
                                className={cn(
                                    buttonVariants({ variant: "outline", size: "sm" }),
                                    "h-7 px-2 text-[0.6875rem]",
                                )}
                            >
                                <IconDownload
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {tDecoder("download")}
                            </button>
                        </div>
                    </div>

                    {view === "json" ? (
                        <>
                            <JsonBox
                                id={headerId}
                                label={tDecoder("headerLabel")}
                                part="header"
                                value={headerJson}
                                readOnly
                                placeholder={tDecoder("decodedPlaceholder")}
                                copyLabel={tDecoder("copyHeader")}
                                copied={copied === "header"}
                                onCopy={() => void handleCopy("header", headerJson)}
                            />
                            <JsonBox
                                id={payloadId}
                                label={tDecoder("payloadLabel")}
                                part="payload"
                                value={payloadJson}
                                readOnly
                                placeholder={tDecoder("decodedPlaceholder")}
                                copyLabel={tDecoder("copyPayload")}
                                copied={copied === "payload"}
                                onCopy={() => void handleCopy("payload", payloadJson)}
                            />
                        </>
                    ) : decoded.ok ? (
                        <div className="flex min-w-0 flex-col gap-3">
                            <HeaderClaimsTable rows={buildHeaderRows(decoded.header)} />
                            <PayloadClaimsTable
                                rows={buildPayloadRows(decoded.payload, now)}
                                now={now}
                            />
                        </div>
                    ) : (
                        <p className="text-muted-foreground ring-border/70 bg-muted/40 rounded-xl px-3 py-6 text-center text-[0.8125rem] leading-normal ring-1 ring-inset">
                            {tDecoder("decodedPlaceholder")}
                        </p>
                    )}

                    <Separator />

                    <section className="flex min-w-0 flex-col gap-3">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-[0.8125rem] leading-[1.3] font-medium">
                                {tDecoder("verifyTitle")}
                            </h3>
                            <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                                {tDecoder("verifyDescription")}
                            </p>
                        </div>

                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label id={algorithmLabelId} className="text-muted-foreground text-xs">
                                <span className="leading-[1.3]">
                                    {tDecoder("expectedAlgorithmLabel")}
                                </span>
                            </Label>
                            <AlgorithmSelect
                                value={expectedAlgorithm}
                                onChange={handleAlgorithmChange}
                                labelledBy={algorithmLabelId}
                                className="w-full sm:w-44"
                            />
                            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {algorithmDiffers
                                    ? tDecoder("algorithmDiffers", {
                                          declared: headerAlgorithm ?? "",
                                          expected: expectedAlgorithm,
                                      })
                                    : tDecoder("expectedAlgorithmHint")}
                            </p>
                        </div>

                        <KeyField
                            algorithm={expectedAlgorithm}
                            value={keyInput}
                            onChange={setKeyInput}
                            purpose="verification"
                            copied={copied === "key"}
                            onCopy={() =>
                                void handleCopy(
                                    "key",
                                    keyInput.kind === "secret" ? keyInput.secret : keyInput.pem,
                                )
                            }
                        />

                        <StatusStrip tone={verifyStatus.tone} message={verifyStatus.message} />
                    </section>
                </div>
            </div>
        </div>
    );
}
