"use client";

import { IconAlertTriangle, IconLoader2, IconSparkles } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { TURNSTILE_ACTION } from "../domain/constants";
import type { ShortLinkCreatedView } from "@/modules/short-links/types";

type QrDynamicPanelProps = {
    enabled: boolean;
    /** False when this deployment stores nothing, or has no challenge key. */
    available: boolean;
    siteKey: string | null;
    /** Absent while the challenge has not been solved. */
    token: string | null;
    resetSignal: number;
    /** The destination the code would point at, already typed by the reader. */
    hasTarget: boolean;
    created: ShortLinkCreatedView | null;
    creating: boolean;
    error: string | null;
    onToggle: (enabled: boolean) => void;
    onVerify: (token: string) => void;
    onChallengeCleared: () => void;
    onCreate: () => void;
    onCopy: (value: string) => void;
};

export function QrDynamicPanel({
    enabled,
    available,
    siteKey,
    token,
    resetSignal,
    hasTarget,
    created,
    creating,
    error,
    onToggle,
    onVerify,
    onChallengeCleared,
    onCreate,
    onCopy,
}: QrDynamicPanelProps) {
    const t = useTranslations("qr.dynamic");
    const [copied, setCopied] = useState<"short" | "edit" | null>(null);

    function copy(value: string, which: "short" | "edit") {
        onCopy(value);
        setCopied(which);
    }

    return (
        <div
            className={cn(
                "ring-border/70 flex flex-col gap-3 rounded-xl px-4 py-3.5 ring-1 ring-inset",
                enabled ? "bg-primary/6 ring-primary/30" : "bg-card/60",
                !available && "opacity-70",
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                    <input
                        type="checkbox"
                        checked={enabled}
                        disabled={!available || created !== null}
                        onChange={(event) => onToggle(event.target.checked)}
                        className="accent-primary focus-visible:ring-ring mt-0.5 size-4 shrink-0 rounded focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed"
                    />
                    <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[0.8125rem] leading-[1.3] font-medium">
                                {t("title")}
                            </span>
                            <span className="bg-primary/12 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] leading-[1.3] font-medium">
                                <IconSparkles className="size-3" stroke={1.9} aria-hidden="true" />
                                {t("badge")}
                            </span>
                        </span>
                        <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {available ? t("description") : t("unavailable")}
                        </span>
                    </span>
                </label>
            </div>

            {enabled && available && created === null && (
                <div className="flex flex-col gap-3">
                    {siteKey !== null && (
                        <TurnstileWidget
                            siteKey={siteKey}
                            action={TURNSTILE_ACTION}
                            resetSignal={resetSignal}
                            onVerify={onVerify}
                            onExpire={onChallengeCleared}
                            onError={onChallengeCleared}
                        />
                    )}

                    <Button
                        type="button"
                        size="sm"
                        onClick={onCreate}
                        disabled={creating || token === null || !hasTarget}
                    >
                        {creating && (
                            <IconLoader2
                                className="size-4 animate-spin"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                        )}
                        {t("create")}
                    </Button>

                    {error !== null && <StatusStrip tone="error" message={error} />}

                    {error === null && token === null && (
                        <StatusStrip tone="pending" message={t("challengePending")} />
                    )}
                </div>
            )}

            {created !== null && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("shortUrlLabel")}
                        </p>
                        <div className="bg-background ring-border/70 flex items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 ring-inset">
                            <code className="min-w-0 flex-1 truncate font-mono text-[0.75rem]">
                                {created.shortUrl}
                            </code>
                            <IconCopyButton
                                copied={copied === "short"}
                                aria-label={t("copyShortUrl")}
                                onClick={() => copy(created.shortUrl, "short")}
                            />
                        </div>
                    </div>

                    <div className="border-brand-amber/40 bg-brand-amber/8 flex flex-col gap-1.5 rounded-lg border p-2.5">
                        <p className="text-brand-amber flex items-start gap-1.5 text-[0.6875rem] leading-[1.4] font-medium">
                            <IconAlertTriangle
                                className="mt-px size-3.5 shrink-0"
                                stroke={1.9}
                                aria-hidden="true"
                            />
                            {t("editUrlWarning")}
                        </p>
                        <div className="bg-background ring-border/70 flex items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 ring-inset">
                            <code className="min-w-0 flex-1 truncate font-mono text-[0.75rem]">
                                {created.editUrl}
                            </code>
                            <IconCopyButton
                                copied={copied === "edit"}
                                aria-label={t("copyEditUrl")}
                                onClick={() => copy(created.editUrl, "edit")}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
