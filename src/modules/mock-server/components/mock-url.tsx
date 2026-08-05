"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { copyText } from "@/modules/tools/domain/clipboard";

import { MOCK_EXECUTION_PREFIX } from "../domain/constants";

type MockUrlProps = {
    origin: string;
    serverKey: string;
    /** Appended after the server key; already normalised by `parsePathPattern`. */
    path?: string;
    className?: string;
};

/**
 * The address somebody actually calls, with a copy button.
 *
 * `origin` is a prop rather than read from `window` here, because the same
 * component renders inside a server-rendered page and reading the location
 * during render is the hydration trap this repository keeps writing down. The
 * page reads it from `SITE_URL` and hands it down.
 */
export function MockUrl({ origin, serverKey, path = "", className }: MockUrlProps) {
    const t = useTranslations("mockServer.servers");
    const [copied, setCopied] = useState(false);

    const url = `${origin}${MOCK_EXECUTION_PREFIX}/${serverKey}${path === "/" ? "" : path}`;

    async function copy() {
        const result = await copyText(url);

        if (result.ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_600);

            return;
        }

        logEvent("error", "mock_server.url_copy_failed", { error: describeError(result.reason) });
        toast.error(t("copyFailed"));
    }

    return (
        <div
            className={cn(
                "border-border/70 bg-muted/40 flex items-center gap-2 rounded-xl border px-2.5 py-1.5",
                className,
            )}
        >
            {/* Wide content scrolls inside its own box; the page never does. */}
            <code className="text-muted-foreground no-scrollbar min-w-0 flex-1 overflow-x-auto font-mono text-[0.6875rem] whitespace-nowrap">
                {url}
            </code>
            <IconCopyButton
                copied={copied}
                onClick={copy}
                aria-label={t("copyUrl")}
                className="shrink-0"
            />
        </div>
    );
}
