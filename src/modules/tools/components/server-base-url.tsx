"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { CopyIconSwap } from "@/modules/tools/components/copy-button";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { copyText } from "@/modules/tools/domain/clipboard";

type BaseUrlProps = {
    /** The execution prefix — `/j` for REST, `/g` for GraphQL. */
    prefix: string;
    serverKey: string;
    className?: string;
};

/**
 * The address somebody points a client at, and a button that copies it.
 *
 * Shared by both server studios; the prefix is a prop because that is the only
 * thing that differs, and two copies of the hydration reasoning below would be
 * one copy too many.
 *
 * The origin comes from `window.location` **behind `useIsHydrated`**, and that
 * is the rule from *Platform APIs That Read the Host* rather than a convenience.
 * The server has no reliable idea what host the reader typed — a preview
 * deployment, a custom domain and localhost are all the same render — so
 * building the absolute URL on the server and hydrating it in the browser is a
 * mismatch waiting for the first non-canonical host.
 *
 * Before hydration the path alone is shown, which is correct on every host and
 * is also the shorter, more readable thing. The absolute form appears a tick
 * later, because that is the form a `curl` needs.
 */
export function ServerBaseUrl({ prefix, serverKey, className }: BaseUrlProps) {
    const t = useTranslations("hostedServer.baseUrl");
    const hydrated = useIsHydrated();
    const [copied, setCopied] = useState(false);

    const path = `${prefix}/${serverKey}`;
    const shown = hydrated ? `${window.location.origin}${path}` : path;

    async function copy() {
        const result = await copyText(shown);

        if (result.ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2_000);

            return;
        }

        logEvent("error", "hosted_server.base_url_copy_failed", {
            error: describeError(result.reason),
        });
        toast.error(t("copyFailed"));
    }

    return (
        <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
            {/*
                `min-w-0` and `truncate` together: without the first, a long
                origin blows the flex row out of the card at 390px.
            */}
            <code className="border-border/70 bg-muted/40 text-foreground min-w-0 flex-1 truncate rounded-xl border px-3 py-2 font-mono text-xs">
                {shown}
            </code>
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={copy}
            >
                <CopyIconSwap copied={copied} />
                {copied ? t("copied") : t("copy")}
            </Button>
        </div>
    );
}
