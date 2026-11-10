"use client";

import { IconAlertTriangle, IconLock, IconLockOpen } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CodeBlock } from "@/modules/tools/components/code-block";
import { ConfirmRow } from "@/modules/tools/components/confirm-row";
import { CopyIconSwap } from "@/modules/tools/components/copy-button";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { ACCESS_TOKEN_HEADER, type ServerAccess } from "@/modules/tools/domain/access-token";
import { copyText } from "@/modules/tools/domain/clipboard";

type ServerAccessPanelProps = {
    access: ServerAccess;
    hasAccessToken: boolean;
    /** Resolves to `null` on success, or a failure already in the reader's language. */
    onSetAccess: (access: ServerAccess) => Promise<string | null>;
    onRotate: () => Promise<{ readonly token: string } | { readonly failure: string }>;
};

/**
 * Who may call a hosted server's public address, and the token that proves it.
 *
 * Shared by the Mock, JSON and GraphQL studios, each of which passes its own
 * Server Actions in — the panel owns the wording and the once-only reveal, the
 * module owns ownership and storage.
 *
 * The token is shown exactly once, straight from the action's result, and held
 * only in this component's state: the database keeps a digest, so a reload
 * cannot show it again and the copy says so before that becomes a surprise.
 */
export function ServerAccessPanel({
    access: initialAccess,
    hasAccessToken: initialHasToken,
    onSetAccess,
    onRotate,
}: ServerAccessPanelProps) {
    const t = useTranslations("hostedServer.access");
    const switchId = useId();

    const [access, setAccess] = useState(initialAccess);
    const [hasToken, setHasToken] = useState(initialHasToken);
    const [issued, setIssued] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    const [copied, setCopied] = useCopyFeedback<"token">();
    const [pending, startTransition] = useTransition();

    const isPrivate = access === "PRIVATE";
    const locked = isPrivate && !hasToken;

    function toggle(next: boolean) {
        const target: ServerAccess = next ? "PRIVATE" : "OPEN";

        setFailure(null);
        startTransition(async () => {
            const problem = await onSetAccess(target);

            if (problem !== null) {
                setFailure(problem);

                return;
            }

            setAccess(target);
            toast.success(next ? t("madePrivate") : t("madeOpen"));
        });
    }

    function rotate() {
        setFailure(null);
        setConfirming(false);
        startTransition(async () => {
            const result = await onRotate();

            if ("failure" in result) {
                setFailure(result.failure);

                return;
            }

            setIssued(result.token);
            setHasToken(true);
        });
    }

    async function copyToken() {
        if (issued === null) {
            return;
        }

        const result = await copyText(issued);

        if (result.ok) {
            setCopied("token");

            return;
        }

        toast.error(t("copyFailed"));
    }

    return (
        <section
            aria-labelledby={`${switchId}-heading`}
            className={cn(
                "flex flex-col gap-3 rounded-2xl border p-4 transition-colors",
                locked ? "border-brand-amber/45 bg-brand-amber/6" : "border-border/70 bg-card",
            )}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                    id={`${switchId}-heading`}
                    className="text-foreground flex items-center gap-2 text-sm leading-[1.3] font-semibold"
                >
                    {isPrivate ? (
                        <IconLock
                            className="text-brand-emerald size-4 shrink-0"
                            stroke={1.9}
                            aria-hidden="true"
                        />
                    ) : (
                        <IconLockOpen
                            className="text-brand-amber size-4 shrink-0"
                            stroke={1.9}
                            aria-hidden="true"
                        />
                    )}
                    {t("title")}
                    <span
                        className={cn(
                            "rounded-lg px-2 py-0.5 text-[0.6875rem] font-medium",
                            isPrivate
                                ? "bg-brand-emerald/12 text-brand-emerald"
                                : "bg-brand-amber/12 text-brand-amber",
                        )}
                    >
                        {isPrivate ? t("private") : t("open")}
                    </span>
                </h2>

                <div className="flex items-center gap-2">
                    <Label htmlFor={switchId} className="text-xs">
                        {t("requireToken")}
                    </Label>
                    <Switch
                        id={switchId}
                        checked={isPrivate}
                        disabled={pending}
                        onCheckedChange={toggle}
                    />
                </div>
            </div>

            <p className="text-muted-foreground max-w-[68ch] text-xs leading-relaxed">
                {isPrivate
                    ? t("privateDescription", { header: ACCESS_TOKEN_HEADER })
                    : t("openDescription")}
            </p>

            {locked ? (
                <p className="text-brand-amber flex items-start gap-1.5 text-[0.6875rem] leading-normal">
                    <IconAlertTriangle
                        className="mt-px size-3.5 shrink-0"
                        stroke={2}
                        aria-hidden="true"
                    />
                    {t("lockedNotice")}
                </p>
            ) : null}

            {isPrivate && issued !== null ? (
                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <code className="border-border/70 bg-muted/40 text-foreground min-w-0 rounded-xl border px-3 py-2 font-mono text-xs break-all select-all">
                            {issued}
                        </code>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={copyToken}
                        >
                            <CopyIconSwap copied={copied === "token"} />
                            {copied === "token" ? t("copied") : t("copy")}
                        </Button>
                    </div>
                    <p className="text-brand-amber max-w-[68ch] text-[0.6875rem] leading-normal">
                        {t("shownOnce")}
                    </p>
                    <CodeBlock
                        code={`${ACCESS_TOKEN_HEADER}: ${issued}`}
                        language="shell"
                        className="max-w-2xl"
                    />
                </div>
            ) : null}

            {isPrivate ? (
                confirming ? (
                    <ConfirmRow
                        label={t("rotateConfirm")}
                        confirmLabel={t("rotate")}
                        onCancel={() => setConfirming(false)}
                        onConfirm={rotate}
                        disabled={pending}
                    />
                ) : (
                    <Button
                        type="button"
                        size="sm"
                        variant={hasToken ? "outline" : "default"}
                        className="w-fit"
                        disabled={pending}
                        // Issuing the first token has nothing to revoke, so it
                        // skips the confirmation; rotating kills a live one.
                        onClick={hasToken ? () => setConfirming(true) : rotate}
                    >
                        {hasToken ? t("rotate") : t("generate")}
                    </Button>
                )
            ) : null}

            <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-normal">
                {t("frontEndCaveat")}
            </p>

            {failure !== null ? <StatusStrip tone="error" message={failure} /> : null}
        </section>
    );
}
