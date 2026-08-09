"use client";

import { IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import type { RsaKeyKind } from "@/modules/tools/types";
import type { RsaRenderedKey } from "../types";

type KeyPanelProps = {
    kind: RsaKeyKind;
    value: RsaRenderedKey | null;
    /** True while the options have moved on from what minted these bytes. */
    stale: boolean;
    copied: boolean;
    onCopy: () => void;
    onDownload: () => void;
};

/**
 * One half of the pair: the block itself, a copy, a download, and — on the
 * private side only — the sentence that has to be read before the key is put
 * anywhere.
 *
 * Both halves scroll inside a fixed height rather than growing without bound. A
 * 4096-bit private key is thirty-odd lines of base64, and two of those stacked
 * would push the download buttons a full screen below the button that produced
 * them.
 */
export function KeyPanel({ kind, value, stale, copied, onCopy, onDownload }: KeyPanelProps) {
    const t = useTranslations("rsa.workbench");

    const outputId = useId();
    const empty = value === null || value.text.length === 0;

    return (
        <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Label htmlFor={outputId} className="text-muted-foreground text-xs">
                        <span className="leading-[1.3]">{t(`keyLabel.${kind}`)}</span>
                    </Label>
                    {/* The PEM header, shown as data rather than as copy — it is
                        the one thing that tells a reader at a glance which
                        container they are looking at. Absent under DER and JWK,
                        which have no header to show. */}
                    {value?.label != null && (
                        <span className="text-muted-foreground ring-border/70 rounded-full px-2 py-0.5 font-mono text-[0.625rem] leading-[1.4] ring-1 ring-inset">
                            {value.label}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={onDownload}
                        disabled={empty}
                        className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-7 px-2 text-[0.6875rem]",
                        )}
                    >
                        <IconDownload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("download")}
                    </button>
                    <IconCopyButton
                        copied={copied}
                        onClick={onCopy}
                        disabled={empty}
                        aria-label={t(`copyKey.${kind}`)}
                        title={t(`copyKey.${kind}`)}
                        className="disabled:pointer-events-none disabled:opacity-40"
                    />
                </div>
            </div>

            {/* A capped, scrolling box has to be reachable without a pointer,
                so it takes focus once there is something in it to scroll. An
                empty placeholder is not a tab stop worth spending. */}
            <output
                id={outputId}
                tabIndex={empty ? undefined : 0}
                className={cn(
                    "focus-visible:ring-ring rounded-lg focus-visible:ring-2 focus-visible:outline-none",
                    "bg-muted/40 max-h-56 min-h-32 overflow-y-auto px-2.5 py-2",
                    "font-mono text-[0.8125rem] leading-6 break-all whitespace-pre-wrap",
                    "transition-opacity duration-200",
                    // Dimmed rather than blanked: the key already on screen is
                    // still a real key, and the strip below says what changed.
                    stale && "opacity-55",
                )}
            >
                {empty ? (
                    <span className="text-muted-foreground">{t(`placeholder.${kind}`)}</span>
                ) : (
                    value.text
                )}
            </output>

            {kind === "private" && !empty && (
                <StatusStrip tone="warning" message={t("privateKeyWarning")} />
            )}
        </div>
    );
}
