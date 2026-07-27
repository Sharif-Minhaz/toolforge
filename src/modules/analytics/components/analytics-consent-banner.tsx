"use client";

import { IconChartBar } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setAnalyticsConsent } from "@/modules/analytics/actions/set-analytics-consent";
import type { ConsentValue } from "@/modules/analytics/domain/consent";

const EASE = [0.22, 0.61, 0.36, 1] as const;

/**
 * Non-modal consent prompt. Anchored bottom-right so it clears the sidebar rail
 * at every breakpoint — the language switcher lives at the foot of that rail,
 * and a visitor may well need it to read this very banner.
 */
export function AnalyticsConsentBanner() {
    const t = useTranslations("analytics.consent");
    const router = useRouter();
    const reduceMotion = useReducedMotion();
    const [isPending, startTransition] = useTransition();

    function choose(value: ConsentValue) {
        startTransition(async () => {
            const result = await setAnalyticsConsent(value);

            if (!result.ok) {
                toast.error(t("failed"));

                return;
            }

            // Server components re-render with the cookie in place, which drops
            // this banner and — on accept — mounts gtag.js.
            router.refresh();
        });
    }

    const className =
        "fixed right-3 bottom-3 z-50 w-[min(26rem,calc(100vw-1.5rem))] sm:right-4 sm:bottom-4";

    const panel = (
        <div className="bg-card/95 ring-border/70 flex flex-col gap-3 rounded-2xl p-4 shadow-lg ring-1 backdrop-blur">
            <div className="flex items-start gap-2.5">
                <span className="bg-muted text-primary mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg">
                    <IconChartBar className="size-4" stroke={1.9} aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-sm leading-[1.4] font-semibold">{t("title")}</p>
                    <p className="text-muted-foreground text-[0.8125rem] leading-[1.6]">
                        {t("description")}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => choose("denied")}
                >
                    {t("decline")}
                </Button>
                <Button size="sm" disabled={isPending} onClick={() => choose("granted")}>
                    {t("accept")}
                </Button>
            </div>
        </div>
    );

    if (reduceMotion) {
        return (
            <section aria-label={t("title")} className={className}>
                {panel}
            </section>
        );
    }

    return (
        <motion.section
            aria-label={t("title")}
            className={className}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
        >
            {panel}
        </motion.section>
    );
}
