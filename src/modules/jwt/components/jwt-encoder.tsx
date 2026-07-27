"use client";

import { IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { getKeyFormat, resolveExpectedAlgorithm } from "../domain/algorithms";
import {
    DEFAULT_HEADER_JSON,
    DEFAULT_JWT_ALGORITHM,
    DEFAULT_PAYLOAD_JSON,
    DEFAULT_SECRET,
} from "../domain/constants";
import { decodeJwt } from "../domain/decode";
import { createJwtExportFile } from "../domain/export";
import type { JwtExample } from "../domain/examples";
import { applyAlgorithmToHeader, readAlgorithmFromHeaderJson } from "../domain/header";
import { parseJsonObject } from "../domain/json";
import { signJwt } from "../domain/sign";
import type { JwtAlgorithm, JwtKeyInput, JwtSignResult } from "../types";
import { AlgorithmSelect } from "./algorithm-select";
import { ExampleGenerator } from "./example-generator";
import { JsonBox } from "./json-box";
import { KeyField } from "./key-field";
import { TokenSegments } from "./token-segments";

type CopyPanel = "header" | "payload" | "key" | "token";

const EMPTY_PEM: JwtKeyInput = { kind: "pem", pem: "" };
const DEMO_SECRET_INPUT: JwtKeyInput = { kind: "secret", secret: DEFAULT_SECRET, base64url: false };

function toKeyInput(algorithm: JwtAlgorithm, material: string): JwtKeyInput {
    return getKeyFormat(algorithm) === "secret"
        ? { kind: "secret", secret: material, base64url: false }
        : { kind: "pem", pem: material };
}

type JwtEncoderProps = {
    example: JwtExample | null;
};

export function JwtEncoder({ example }: JwtEncoderProps) {
    const tEncoder = useTranslations("jwt.workbench.encoder");
    const tErrors = useTranslations("jwt.errors");
    const tToast = useTranslations("jwt.toast");

    const headerId = useId();
    const payloadId = useId();
    const algorithmLabelId = useId();

    const [headerJson, setHeaderJson] = useState(example?.headerJson ?? DEFAULT_HEADER_JSON);
    const [payloadJson, setPayloadJson] = useState(example?.payloadJson ?? DEFAULT_PAYLOAD_JSON);
    const [keyInput, setKeyInput] = useState<JwtKeyInput>(
        example === null ? DEMO_SECRET_INPUT : toKeyInput(example.algorithm, example.signingKey),
    );
    const [signed, setSigned] = useState<{ key: string; result: JwtSignResult } | null>(null);
    const [copied, setCopied] = useCopyFeedback<CopyPanel>();

    const settledHeader = useDebouncedValue(headerJson);
    const settledPayload = useDebouncedValue(payloadJson);
    const settledKey = useDebouncedValue(keyInput);
    const pending = settledHeader !== headerJson || settledPayload !== payloadJson;

    const headerParse = parseJsonObject(settledHeader);
    const payloadParse = parseJsonObject(settledPayload);
    // The header owns `alg`; the select above is a shortcut that edits it, so
    // there is never a second source of truth to fall out of step.
    const algorithm = resolveExpectedAlgorithm(
        null,
        readAlgorithmFromHeaderJson(settledHeader),
        DEFAULT_JWT_ALGORITHM,
    );

    const requestKey = JSON.stringify([settledHeader, settledPayload, settledKey]);

    useEffect(() => {
        let cancelled = false;

        void signJwt({
            headerJson: settledHeader,
            payloadJson: settledPayload,
            key: settledKey,
        }).then((result) => {
            if (!cancelled) {
                setSigned({ key: requestKey, result });
            }
        });

        return () => {
            cancelled = true;
        };
    }, [requestKey, settledHeader, settledPayload, settledKey]);

    const result = signed?.key === requestKey ? signed.result : null;
    const token = result?.ok ? result.token : "";
    const decodedToken = token.length === 0 ? null : decodeJwt(token);

    function describeParse(parse: typeof headerParse, part: "header" | "payload") {
        if (parse.ok) {
            return {
                tone: "success" as StatusTone,
                message: part === "header" ? tEncoder("validHeader") : tEncoder("validPayload"),
            };
        }

        return {
            tone: "error" as StatusTone,
            message: tErrors(`json.${parse.reason}`),
        };
    }

    function describeSigning(): { tone: StatusTone; message: string } {
        if (result === null) {
            return { tone: "pending", message: tEncoder("signing") };
        }

        return result.ok
            ? { tone: "success", message: tEncoder("signed", { algorithm }) }
            : { tone: "error", message: tErrors(`sign.${result.reason}`) };
    }

    const signStatus = describeSigning();

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
        const copiedResult = await copyText(value);

        if (!copiedResult.ok) {
            reportCopyFailure(copiedResult);

            return;
        }

        setCopied(panel);
        toast.success(tToast("copied"));
    }

    function handleDownload() {
        const file = createJwtExportFile({
            mode: "encode",
            content: token,
            generatedAt: new Date(),
        });

        try {
            saveFile(file);
            toast.success(tToast("downloaded", { filename: file.filename }));
        } catch (caught) {
            logEvent("error", "jwt.download_failed", {
                mode: "encode",
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    function handleAlgorithmChange(next: JwtAlgorithm) {
        setHeaderJson((current) => applyAlgorithmToHeader(current, next));

        if (getKeyFormat(next) !== getKeyFormat(algorithm)) {
            setKeyInput(getKeyFormat(next) === "secret" ? DEMO_SECRET_INPUT : EMPTY_PEM);
        }
    }

    function handleExample(next: JwtExample) {
        setHeaderJson(next.headerJson);
        setPayloadJson(next.payloadJson);
        setKeyInput(toKeyInput(next.algorithm, next.signingKey));
    }

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-muted-foreground max-w-md text-[0.8125rem] leading-normal">
                    {tEncoder("description")}
                </p>
                <ExampleGenerator onGenerate={handleExample} />
            </div>

            <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:gap-6">
                <div className="flex min-w-0 flex-col gap-4">
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label id={algorithmLabelId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{tEncoder("algorithmLabel")}</span>
                        </Label>
                        <AlgorithmSelect
                            value={algorithm}
                            onChange={handleAlgorithmChange}
                            labelledBy={algorithmLabelId}
                            className="w-full sm:w-44"
                        />
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {tEncoder("algorithmHint")}
                        </p>
                    </div>

                    <JsonBox
                        id={headerId}
                        label={tEncoder("headerLabel")}
                        part="header"
                        value={headerJson}
                        onChange={setHeaderJson}
                        copyLabel={tEncoder("copyHeader")}
                        copied={copied === "header"}
                        onCopy={() => void handleCopy("header", headerJson)}
                        status={
                            <StatusStrip
                                {...describeParse(headerParse, "header")}
                                className={cn(
                                    "transition-opacity duration-200",
                                    pending && "opacity-55",
                                )}
                            />
                        }
                    />

                    <JsonBox
                        id={payloadId}
                        label={tEncoder("payloadLabel")}
                        part="payload"
                        value={payloadJson}
                        onChange={setPayloadJson}
                        copyLabel={tEncoder("copyPayload")}
                        copied={copied === "payload"}
                        onCopy={() => void handleCopy("payload", payloadJson)}
                        status={
                            <StatusStrip
                                {...describeParse(payloadParse, "payload")}
                                className={cn(
                                    "transition-opacity duration-200",
                                    pending && "opacity-55",
                                )}
                            />
                        }
                    />
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                    <section className="flex min-w-0 flex-col gap-3">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-[0.8125rem] leading-[1.3] font-medium">
                                {tEncoder("keyTitle")}
                            </h3>
                            <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                                {tEncoder("keyDescription")}
                            </p>
                        </div>

                        <KeyField
                            algorithm={algorithm}
                            value={keyInput}
                            onChange={setKeyInput}
                            purpose="signing"
                            copied={copied === "key"}
                            onCopy={() =>
                                void handleCopy(
                                    "key",
                                    keyInput.kind === "secret" ? keyInput.secret : keyInput.pem,
                                )
                            }
                        />
                    </section>

                    <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-muted-foreground text-xs leading-[1.3]">
                                {tEncoder("tokenLabel")}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={handleDownload}
                                    disabled={token.length === 0}
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
                                    {tEncoder("download")}
                                </button>
                                <IconCopyButton
                                    copied={copied === "token"}
                                    onClick={() => void handleCopy("token", token)}
                                    aria-label={tEncoder("copyToken")}
                                />
                            </div>
                        </div>

                        <div
                            className={cn(
                                "bg-muted/40 min-h-36 rounded-lg px-2.5 py-2",
                                "transition-opacity duration-200",
                                (pending || result === null) && "opacity-55",
                            )}
                        >
                            {decodedToken?.ok ? (
                                <TokenSegments segments={decodedToken.segments} />
                            ) : (
                                <p className="text-muted-foreground font-mono text-[0.8125rem] leading-6">
                                    {tEncoder("tokenPlaceholder")}
                                </p>
                            )}
                        </div>

                        <StatusStrip tone={signStatus.tone} message={signStatus.message} />
                    </div>
                </div>
            </div>
        </div>
    );
}
