"use client";

import { IconRefresh } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";

import { MOTION_EASE } from "@/components/motion/motion-tokens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CopyIconSwap } from "@/modules/tools/components/copy-button";

type SecretOutputProps = {
    /** `null` until the browser has drawn one — the server never sends a key. */
    secret: string | null;
    stale: boolean;
    copied: boolean;
    /** Bumped on every deliberate redraw, to replay the icon spin. */
    spinToken: number;
    onCopy: () => void;
    onRegenerate: () => void;
};

export function SecretOutput({
    secret,
    stale,
    copied,
    spinToken,
    onCopy,
    onRegenerate,
}: SecretOutputProps) {
    const t = useTranslations("secret.workbench");
    const reduceMotion = useReducedMotion();

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div
                className={cn(
                    "bg-card/60 ring-border/70 min-w-0 rounded-2xl px-4 py-3.5 ring-1 ring-inset",
                    "transition-opacity duration-200",
                    stale && "opacity-55",
                )}
            >
                {secret === null ? (
                    <p className="text-muted-foreground flex min-h-8 items-center text-sm">
                        <span className="shimmer bg-muted h-5 w-56 rounded-md" aria-hidden="true" />
                        <span className="sr-only">{t("drawing")}</span>
                    </p>
                ) : (
                    <p
                        // A key is not prose: never spell-checked, never
                        // translated by a browser or an extension, and never
                        // auto-capitalised on the way through.
                        translate="no"
                        spellCheck={false}
                        className="min-h-8 min-w-0 font-mono text-base leading-8 break-all select-all sm:text-lg"
                    >
                        {secret}
                    </p>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={onCopy} disabled={secret === null} className="h-9 px-3.5">
                    <CopyIconSwap copied={copied} />
                    {t("copy")}
                </Button>

                <Button variant="outline" onClick={onRegenerate} className="h-9 px-3.5">
                    <motion.span
                        key={spinToken}
                        initial={reduceMotion ? false : { rotate: -180 }}
                        animate={{ rotate: 0 }}
                        transition={{ duration: 0.32, ease: MOTION_EASE }}
                        className="grid place-items-center"
                    >
                        <IconRefresh className="size-4" stroke={1.9} aria-hidden="true" />
                    </motion.span>
                    {t("regenerate")}
                </Button>
            </div>
        </div>
    );
}
