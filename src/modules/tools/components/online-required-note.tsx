"use client";

import { IconWifiOff } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * Said beside a control that is disabled because the browser is offline.
 *
 * - `model`: weights this tool runs on are not on the device yet; one online
 *   run fetches them, and after that the tool works offline.
 * - `feature`: the control itself talks to a server.
 */
export function OnlineRequiredNote({
    kind,
    className,
}: {
    readonly kind: "model" | "feature";
    readonly className?: string;
}) {
    const t = useTranslations("pwa.onlineRequired");

    return (
        <p
            role="status"
            className={cn(
                "text-muted-foreground flex items-start gap-1.5 text-[0.8125rem] leading-relaxed",
                className,
            )}
        >
            <IconWifiOff className="mt-0.5 size-3.5 shrink-0" stroke={1.9} aria-hidden="true" />
            {t(kind)}
        </p>
    );
}
