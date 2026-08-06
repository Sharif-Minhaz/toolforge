"use client";

import { IconDeviceFloppy, IconLoader2 } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { updateLink } from "@/modules/short-links/actions/update-link";
import { MAX_TARGET_URL_LENGTH, PASSWORD_LENGTH } from "@/modules/short-links/domain/constants";
import type { ShortLinkFailureReason, ShortLinkView } from "@/modules/short-links/types";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { DateTimePicker } from "@/modules/tools/components/date-time-picker";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { copyText } from "@/modules/tools/domain/clipboard";
import {
    instantToLocalDateTime,
    localDateTimeToInstant,
} from "@/modules/tools/domain/local-datetime";
import { SCHEDULE_DEFAULT_TIME } from "../domain/constants";
import { useLinkHistory } from "@/modules/short-links/components/use-link-history";

type ShortLinkEditorProps = {
    editToken: string;
    /** Rebuilt server-side, so the history row keeps a working edit link. */
    editUrl: string;
    link: ShortLinkView;
};

/**
 * Everything about a link its owner may change after the fact.
 *
 * The short link itself is not on that list — that is the whole point, and it
 * is why the address sits above the form as text rather than as a field.
 */
export function ShortLinkEditor({ editToken, editUrl, link }: ShortLinkEditorProps) {
    const t = useTranslations("shortener.edit");
    const tErrors = useTranslations("shortLinks.errors");
    const tToast = useTranslations("shortener.toast");
    const tPicker = useTranslations("common.datePicker");
    const format = useFormatter();

    const targetId = useId();
    const passwordId = useId();
    const startsId = useId();
    const expiresId = useId();

    const history = useLinkHistory("shortener");

    // The reader's zone is a host value, so it is only consulted once hydration
    // has happened. Until then both the server and the hydration pass render the
    // window in UTC, which keeps them in step; the fields refresh a tick later.
    const hydrated = useIsHydrated();
    const timeZone = hydrated ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

    const [current, setCurrent] = useState(link);
    const [target, setTarget] = useState(link.target);
    const [passwordEnabled, setPasswordEnabled] = useState(link.hasPassword);
    const [password, setPassword] = useState("");
    // Null until the reader touches a field, so the prefilled value can follow
    // the zone once it is known without ever overwriting an edit in progress.
    const [window_, setWindow] = useState<{ startsAt: string; expiresAt: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [failure, setFailure] = useState<ShortLinkFailureReason | null>(null);
    const [copied, setCopied] = useState(false);

    // Both cap at `maxLength`, so neither can read "over" — the meters count
    // the last stretch down and go quiet again once the value is trimmed.
    const targetLimit = useInputLimit(target.length, MAX_TARGET_URL_LENGTH);
    const passwordLimit = useInputLimit(password.length, PASSWORD_LENGTH.max);

    const startsAt = window_?.startsAt ?? instantToLocalDateTime(current.startsAt, timeZone);
    const expiresAt = window_?.expiresAt ?? instantToLocalDateTime(current.expiresAt, timeZone);

    function patchWindow(patch: Partial<{ startsAt: string; expiresAt: string }>) {
        setWindow({ startsAt, expiresAt, ...patch });
        setFailure(null);
    }

    /**
     * Three cases, not two. Absent leaves the stored password alone, `null`
     * removes it, a string replaces it — so "I only moved the destination"
     * never silently unlocks a link.
     */
    function resolvePassword(): string | null | undefined {
        if (!passwordEnabled) {
            return current.hasPassword ? null : undefined;
        }

        return password.length > 0 ? password : undefined;
    }

    async function handleSave() {
        setSaving(true);
        setFailure(null);

        try {
            const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const result = await updateLink({
                tool: "shortener",
                editToken,
                target,
                password: resolvePassword(),
                startsAt: localDateTimeToInstant(startsAt, zone),
                expiresAt: localDateTimeToInstant(expiresAt, zone),
            });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setCurrent(result.value);
            setTarget(result.value.target);
            setPassword("");
            setPasswordEnabled(result.value.hasPassword);
            setWindow(null);
            history.remember({
                slug: result.value.slug,
                shortUrl: result.value.shortUrl,
                target: result.value.target,
                editUrl,
                hasPassword: result.value.hasPassword,
                startsAt: result.value.startsAt,
                expiresAt: result.value.expiresAt,
                createdAt: result.value.createdAt,
            });
            toast.success(tToast("updated"));
        } catch (caught) {
            logEvent("error", "shortener.update_failed", { error: describeError(caught) });
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={targetId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("target")}</span>
                        </Label>
                        <InputLimitMeter reading={targetLimit} />
                    </div>
                    <Input
                        id={targetId}
                        type="url"
                        inputMode="url"
                        maxLength={MAX_TARGET_URL_LENGTH}
                        value={target}
                        onChange={(event) => {
                            setTarget(event.target.value);
                            setFailure(null);
                        }}
                    />
                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("targetHint")}
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    <OptionSwitch
                        label={t("passwordToggle")}
                        hint={
                            current.hasPassword ? t("passwordToggleSet") : t("passwordToggleHint")
                        }
                        checked={passwordEnabled}
                        onCheckedChange={(next) => {
                            setPasswordEnabled(next);
                            setFailure(null);
                        }}
                    />
                    {passwordEnabled && (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <Label
                                    htmlFor={passwordId}
                                    className="text-muted-foreground text-xs"
                                >
                                    <span className="leading-[1.3]">{t("password")}</span>
                                </Label>
                                <InputLimitMeter reading={passwordLimit} />
                            </div>
                            <Input
                                id={passwordId}
                                type="password"
                                autoComplete="new-password"
                                maxLength={PASSWORD_LENGTH.max}
                                value={password}
                                placeholder={
                                    current.hasPassword
                                        ? t("passwordKeepPlaceholder")
                                        : t("passwordPlaceholder")
                                }
                                onChange={(event) => {
                                    setPassword(event.target.value);
                                    setFailure(null);
                                }}
                            />
                            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {current.hasPassword ? t("passwordKeepHint") : t("passwordHint")}
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-1.5">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label htmlFor={startsId} className="text-muted-foreground text-xs">
                                <span className="leading-[1.3]">{t("startsAt")}</span>
                            </Label>
                            <DateTimePicker
                                id={startsId}
                                value={startsAt}
                                defaultTime={SCHEDULE_DEFAULT_TIME.start}
                                placeholder={tPicker("placeholder")}
                                timeLabel={tPicker("time")}
                                clearLabel={tPicker("clear")}
                                onChange={(next) => patchWindow({ startsAt: next })}
                            />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label htmlFor={expiresId} className="text-muted-foreground text-xs">
                                <span className="leading-[1.3]">{t("expiresAt")}</span>
                            </Label>
                            <DateTimePicker
                                id={expiresId}
                                value={expiresAt}
                                defaultTime={SCHEDULE_DEFAULT_TIME.end}
                                placeholder={tPicker("placeholder")}
                                timeLabel={tPicker("time")}
                                clearLabel={tPicker("clear")}
                                onChange={(next) => patchWindow({ expiresAt: next })}
                            />
                        </div>
                    </div>
                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {t("scheduleHint")}
                    </p>
                </div>

                {failure !== null && <StatusStrip tone="error" message={tErrors(failure)} />}

                <Button
                    type="button"
                    className="w-fit"
                    disabled={saving || target.trim().length === 0}
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
                        <dt className="text-muted-foreground text-[0.6875rem]">{t("visits")}</dt>
                        <dd className="text-[0.9375rem] font-medium">
                            {format.number(current.scans)}
                        </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <dt className="text-muted-foreground text-[0.6875rem]">{t("created")}</dt>
                        <dd className="text-[0.8125rem]">
                            {format.dateTime(new Date(current.createdAt), { dateStyle: "medium" })}
                        </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <dt className="text-muted-foreground text-[0.6875rem]">{t("lastVisit")}</dt>
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
