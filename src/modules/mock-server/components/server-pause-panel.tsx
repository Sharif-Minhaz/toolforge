"use client";

import { IconLoader2, IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatusStrip } from "@/modules/tools/components/status-strip";

import { pauseServer } from "../actions/servers";
import type { ServerFailureReason } from "../types";

type ServerPausePanelProps = {
    serverId: string;
    isPaused: boolean;
};

/**
 * The switch that takes a whole mock server off the air, and the state it puts
 * it in.
 *
 * The flag has existed since M1 — `serveMockRequest` has always refused a paused
 * server — and nothing could set it. What needed deciding was how visible the
 * off state is, and the answer is: more visible than a badge. Somebody who
 * paused a server yesterday and comes back to failing calls today should learn
 * why from the page, not from reading a 503 body, so the paused state repaints
 * the panel, names the status code its routes now answer with, and says the one
 * thing the caller's own error message cannot — that the address is fine.
 *
 * Pausing is not deleting and the copy says so. Endpoints, logs and variables
 * survive untouched, which is exactly what makes this worth having over the
 * delete button next to it.
 */
export function ServerPausePanel({ serverId, isPaused }: ServerPausePanelProps) {
    const t = useTranslations("mockServer.servers");
    const tErrors = useTranslations("mockServer.serverErrors");
    const router = useRouter();

    const [paused, setPaused] = useState(isPaused);
    const [failure, setFailure] = useState<ServerFailureReason | null>(null);
    const [pending, startTransition] = useTransition();

    function toggle() {
        const next = !paused;

        setFailure(null);

        startTransition(async () => {
            const result = await pauseServer({ serverId, isPaused: next });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setPaused(next);
            toast.success(next ? t("pausedToast") : t("resumedToast"));
            // The workspace grid and this page both show the state, so both are
            // revalidated by the action — this is what makes the current render
            // pick that up.
            router.refresh();
        });
    }

    return (
        <section
            aria-labelledby="pause-heading"
            className={cn(
                "flex flex-wrap items-center gap-3 rounded-2xl border p-4 transition-colors",
                paused ? "border-brand-amber/45 bg-brand-amber/6" : "border-border/70 bg-card",
            )}
        >
            <span
                className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[0.6875rem] leading-[1.3] font-medium",
                    paused
                        ? "bg-brand-amber/12 text-brand-amber"
                        : "bg-brand-emerald/12 text-brand-emerald",
                )}
            >
                {paused ? (
                    <IconPlayerPause className="size-3.5" stroke={2} aria-hidden="true" />
                ) : (
                    // A dot rather than a play glyph: the live state is a
                    // condition, not an action, and a play icon beside "Live"
                    // reads as a button to press.
                    <span className="bg-brand-emerald size-1.5 rounded-full" aria-hidden="true" />
                )}
                {paused ? t("paused") : t("live")}
            </span>

            <div className="min-w-0 flex-1">
                <h2 id="pause-heading" className="sr-only">
                    {paused ? t("resume") : t("pause")}
                </h2>
                <p
                    className={cn(
                        "max-w-[68ch] text-xs leading-relaxed",
                        paused ? "text-brand-amber" : "text-muted-foreground",
                    )}
                >
                    {paused ? t("pausedNotice") : t("pauseHint")}
                </p>
            </div>

            <Button
                type="button"
                size="sm"
                variant={paused ? "default" : "outline"}
                className="gap-1.5"
                disabled={pending}
                onClick={toggle}
            >
                {pending ? (
                    <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : paused ? (
                    <IconPlayerPlay className="size-4" aria-hidden="true" />
                ) : (
                    <IconPlayerPause className="size-4" aria-hidden="true" />
                )}
                {paused ? t("resume") : t("pause")}
            </Button>

            {failure !== null ? (
                <div className="w-full">
                    <StatusStrip tone="error" message={tErrors(failure)} />
                </div>
            ) : null}
        </section>
    );
}
