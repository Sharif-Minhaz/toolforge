"use client";

import { IconDeviceFloppy, IconLoader2 } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { copyText } from "@/modules/tools/domain/clipboard";
import { updateLink } from "@/modules/short-links/actions/update-link";
import { useLinkHistory } from "@/modules/short-links/components/use-link-history";
import type { ShortLinkFailureReason, ShortLinkView } from "@/modules/short-links/types";

type DynamicQrEditorProps = {
    editToken: string;
    link: ShortLinkView;
};

/**
 * Re-points an already-printed code. The short link never changes — that is the
 * whole point — so the only editable value here is where it goes.
 */
export function DynamicQrEditor({ editToken, link }: DynamicQrEditorProps) {
    const t = useTranslations("qr.edit");
    const tErrors = useTranslations("shortLinks.errors");
    const tToast = useTranslations("qr.toast");
    const format = useFormatter();
    const history = useLinkHistory("qr");

    const targetId = useId();

    const [current, setCurrent] = useState(link);
    const [target, setTarget] = useState(link.target);
    const [saving, setSaving] = useState(false);
    const [failure, setFailure] = useState<ShortLinkFailureReason | null>(null);
    const [copied, setCopied] = useState(false);

    async function handleSave() {
        setSaving(true);
        setFailure(null);

        try {
            const result = await updateLink({
                tool: "qr",
                editToken,
                target,
                startsAt: current.startsAt,
                expiresAt: current.expiresAt,
            });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setCurrent(result.value);
            setTarget(result.value.target);
            // The row in this browser's list still names the old destination,
            // and the list is the only record there is.
            history.remember({
                slug: result.value.slug,
                shortUrl: result.value.shortUrl,
                target: result.value.target,
                editUrl: `${window.location.origin}${window.location.pathname}`,
                hasPassword: result.value.hasPassword,
                startsAt: result.value.startsAt,
                expiresAt: result.value.expiresAt,
                createdAt: result.value.createdAt,
            });
            toast.success(tToast("dynamicUpdated"));
        } catch (caught) {
            logEvent("error", "qr.dynamic_update_failed", { error: describeError(caught) });
            setFailure("storage_unavailable");
        } finally {
            setSaving(false);
        }
    }

    async function handleCopy() {
        const result = await copyText(current.shortUrl);

        if (result.ok) {
            setCopied(true);
            toast.success(tToast("copied"));

            return;
        }

        toast.error(tToast("copyFailed"));
    }

    const unchanged = target.trim() === current.target;

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardHeader>
                <CardTitle className="text-lg">{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                    <p className="text-muted-foreground text-xs">{t("shortUrl")}</p>
                    <div className="bg-card/60 ring-border/70 flex items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 ring-inset">
                        <code className="min-w-0 flex-1 truncate font-mono text-[0.8125rem]">
                            {current.shortUrl}
                        </code>
                        <IconCopyButton
                            copied={copied}
                            aria-label={t("copyShortUrl")}
                            onClick={() => void handleCopy()}
                        />
                    </div>
                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("shortUrlHint")}
                    </p>
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label htmlFor={targetId} className="text-muted-foreground text-xs">
                        <span className="leading-[1.3]">{t("target")}</span>
                    </Label>
                    <Input
                        id={targetId}
                        type="url"
                        inputMode="url"
                        value={target}
                        onChange={(event) => setTarget(event.target.value)}
                    />
                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("targetHint")}
                    </p>
                </div>

                {failure !== null && <StatusStrip tone="error" message={tErrors(failure)} />}

                <Button
                    type="button"
                    className="w-fit"
                    disabled={saving || unchanged || target.trim().length === 0}
                    onClick={() => void handleSave()}
                >
                    {saving ? (
                        <IconLoader2
                            className="size-4 animate-spin"
                            stroke={1.8}
                            aria-hidden="true"
                        />
                    ) : (
                        <IconDeviceFloppy className="size-4" stroke={1.8} aria-hidden="true" />
                    )}
                    {t("save")}
                </Button>

                <dl className="border-border/70 grid gap-2 border-t pt-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-0.5">
                        <dt className="text-muted-foreground text-[0.6875rem]">{t("scans")}</dt>
                        <dd className="text-[0.9375rem] font-medium">
                            {format.number(current.scans)}
                        </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <dt className="text-muted-foreground text-[0.6875rem]">{t("created")}</dt>
                        <dd className="text-[0.8125rem]">
                            {format.dateTime(new Date(current.createdAt), {
                                dateStyle: "medium",
                            })}
                        </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <dt className="text-muted-foreground text-[0.6875rem]">{t("lastScan")}</dt>
                        <dd className="text-[0.8125rem]">
                            {current.lastScanAt === null
                                ? t("never")
                                : format.dateTime(new Date(current.lastScanAt), {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                  })}
                        </dd>
                    </div>
                </dl>
            </CardContent>
        </Card>
    );
}
