"use client";

import { IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { ALGORITHM_LABELS, ENCODING_LABELS } from "../domain/algorithms";
import { MAX_HASH_INPUT_LENGTH } from "../domain/constants";
import type { CompareResult, DetectedHash } from "../types";

type CopyPanel = "left" | "right";

type ComparePanelProps = {
    left: string;
    right: string;
    onLeftChange: (value: string) => void;
    onRightChange: (value: string) => void;
    onClear: () => void;
    /** What the right-hand box parses as, recomputed on every keystroke. */
    detected: DetectedHash | null;
    /** `null` while the comparison for the current pair has not landed yet. */
    result: CompareResult | null;
    pending: boolean;
    copied: CopyPanel | null;
    onCopy: (panel: CopyPanel, value: string) => void;
    describeFailure: (failure: Extract<CompareResult, { ok: false }>) => string;
};

export function ComparePanel({
    left,
    right,
    onLeftChange,
    onRightChange,
    onClear,
    detected,
    result,
    pending,
    copied,
    onCopy,
    describeFailure,
}: ComparePanelProps) {
    const t = useTranslations("hash.workbench.compare");

    const leftId = useId();
    const rightId = useId();

    function describeDetected(hash: DetectedHash): string {
        switch (hash.family) {
            case "bcrypt":
                return t("detectedBcrypt", { prefix: hash.prefix, cost: hash.cost });
            case "argon2":
                return t("detectedArgon2", {
                    variant: ALGORITHM_LABELS[hash.variant],
                    version: hash.version,
                    memory: hash.memory,
                    iterations: hash.iterations,
                    parallelism: hash.parallelism,
                });
            case "digest":
                return t("detectedDigest", {
                    algorithm: ALGORITHM_LABELS[hash.algorithm],
                    encoding: ENCODING_LABELS[hash.encoding],
                });
        }
    }

    const verdict: { tone: StatusTone; message: string } = (() => {
        if (left.trim().length === 0 || right.trim().length === 0) {
            return { tone: "idle", message: t("awaitingInput") };
        }

        if (result === null) {
            return { tone: "pending", message: t("comparing") };
        }

        if (!result.ok) {
            return { tone: "error", message: describeFailure(result) };
        }

        return result.match
            ? { tone: "success", message: t("match") }
            : { tone: "warning", message: t("mismatch") };
    })();

    // Which check ran is stated rather than inferred: the same two boxes can
    // mean "verify this password" or "compare these checksums", and guessing
    // wrong silently would be the worst thing this panel could do.
    const kind =
        result?.ok === true
            ? result.kind === "digest" && result.detected.family === "digest"
                ? t("kindDigest", { algorithm: ALGORITHM_LABELS[result.detected.algorithm] })
                : t("kindVerify")
            : null;

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-muted-foreground max-w-2xl min-w-0 flex-1 text-[0.8125rem] leading-normal">
                    {t("description")}
                </p>
                <button
                    type="button"
                    onClick={onClear}
                    disabled={left.length === 0 && right.length === 0}
                    className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "h-7 shrink-0 px-2 text-[0.6875rem]",
                    )}
                >
                    <IconX className="size-3.5" stroke={1.9} aria-hidden="true" />
                    {t("clear")}
                </button>
            </div>

            <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:gap-6">
                <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={leftId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("leftLabel")}</span>
                        </Label>
                        <IconCopyButton
                            copied={copied === "left"}
                            onClick={() => onCopy("left", left)}
                            disabled={left.length === 0}
                            aria-label={t("copyLeft")}
                        />
                    </div>
                    <Textarea
                        id={leftId}
                        value={left}
                        onChange={(event) => onLeftChange(event.target.value)}
                        maxLength={MAX_HASH_INPUT_LENGTH}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        placeholder={t("leftPlaceholder")}
                        className="min-h-28 resize-y font-mono text-[0.8125rem] leading-6"
                    />
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={rightId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("rightLabel")}</span>
                        </Label>
                        <IconCopyButton
                            copied={copied === "right"}
                            onClick={() => onCopy("right", right)}
                            disabled={right.length === 0}
                            aria-label={t("copyRight")}
                        />
                    </div>
                    <Textarea
                        id={rightId}
                        value={right}
                        onChange={(event) => onRightChange(event.target.value)}
                        maxLength={MAX_HASH_INPUT_LENGTH}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        placeholder={t("rightPlaceholder")}
                        className="min-h-28 resize-y font-mono text-[0.8125rem] leading-6"
                    />
                    {detected !== null && (
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4] wrap-break-word">
                            {describeDetected(detected)}
                        </p>
                    )}
                </div>
            </div>

            <div
                className={cn(
                    "bg-card/60 ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-inset",
                    "transition-opacity duration-200",
                    pending && "opacity-55",
                )}
            >
                <StatusStrip
                    tone={verdict.tone}
                    message={verdict.message}
                    className="text-[0.8125rem] font-medium"
                />
                {kind !== null && (
                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">{kind}</p>
                )}
            </div>
        </div>
    );
}
