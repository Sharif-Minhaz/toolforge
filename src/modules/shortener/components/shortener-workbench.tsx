"use client";

import { IconArrowRight, IconLoader2, IconPlus, IconWand } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { createLink } from "@/modules/short-links/actions/create-link";
import { CreatedLinkCard } from "@/modules/short-links/components/created-link-card";
import { RecentLinksPanel } from "@/modules/short-links/components/recent-links-panel";
import { useLinkHistory } from "@/modules/short-links/components/use-link-history";
import type { ShortLinkCreatedView, ShortLinkFailureReason } from "@/modules/short-links/types";
import { DateTimePicker } from "@/modules/tools/components/date-time-picker";
import { OptionSwitch } from "@/modules/tools/components/option-controls";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { copyText } from "@/modules/tools/domain/clipboard";
import {
    DEFAULT_DRAFT,
    DEFAULT_TOGGLES,
    SCHEDULE_DEFAULT_TIME,
    TURNSTILE_ACTION,
} from "../domain/constants";
import { localDateTimeToInstant } from "@/modules/tools/domain/local-datetime";
import type { ShortenerDraft, ShortenerToggles } from "../types";

type ShortenerWorkbenchProps = {
    /** `toolforge.example/s/` — shown in front of the alias field. */
    aliasPrefix: string;
    /** False when this deployment has no database, or no challenge key. */
    available: boolean;
    storageReady: boolean;
    turnstileSiteKey: string | null;
    initialTarget: string;
    initialAlias: string;
};

/**
 * The one interactive component on the page.
 *
 * Everything optional starts closed: a reader who wants a short link and
 * nothing else sees a field and a button. The three switches open panels rather
 * than crowding the form, which is also what keeps the disabled states honest —
 * a panel that is shut cannot send a half-typed value.
 */
export function ShortenerWorkbench({
    aliasPrefix,
    available,
    storageReady,
    turnstileSiteKey,
    initialTarget,
    initialAlias,
}: ShortenerWorkbenchProps) {
    const t = useTranslations("shortener.workbench");
    const tErrors = useTranslations("shortLinks.errors");
    const tToast = useTranslations("shortener.toast");
    const tPicker = useTranslations("common.datePicker");

    const targetId = useId();
    const aliasId = useId();
    const passwordId = useId();
    const startsId = useId();
    const expiresId = useId();
    const errorId = useId();

    const history = useLinkHistory("shortener");

    const [draft, setDraft] = useState<ShortenerDraft>({
        ...DEFAULT_DRAFT,
        target: initialTarget,
        alias: initialAlias,
    });
    const [toggles, setToggles] = useState<ShortenerToggles>({
        ...DEFAULT_TOGGLES,
        alias: initialAlias.length > 0,
    });

    const [challengeToken, setChallengeToken] = useState<string | null>(null);
    const [challengeReset, setChallengeReset] = useState(0);
    const [creating, setCreating] = useState(false);
    const [created, setCreated] = useState<ShortLinkCreatedView | null>(null);
    const [failure, setFailure] = useState<ShortLinkFailureReason | null>(null);

    function patchDraft(patch: Partial<ShortenerDraft>) {
        setDraft((current) => ({ ...current, ...patch }));
        setFailure(null);
    }

    function patchToggles(patch: Partial<ShortenerToggles>) {
        setToggles((current) => ({ ...current, ...patch }));
        setFailure(null);
    }

    async function handleCreate() {
        if (challengeToken === null) {
            return;
        }

        setCreating(true);
        setFailure(null);

        // Read here rather than during render: the reader's zone is a host
        // value, and reading it while rendering would make the server and the
        // browser disagree. In an event handler there is only one of them.
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        try {
            const result = await createLink({
                tool: "shortener",
                target: draft.target,
                alias: toggles.alias ? draft.alias : null,
                password: toggles.password && draft.password.length > 0 ? draft.password : null,
                startsAt: toggles.schedule
                    ? localDateTimeToInstant(draft.startsAt, timeZone)
                    : null,
                expiresAt: toggles.schedule
                    ? localDateTimeToInstant(draft.expiresAt, timeZone)
                    : null,
                token: challengeToken,
            });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setCreated(result.value);
            history.remember({
                slug: result.value.slug,
                shortUrl: result.value.shortUrl,
                target: result.value.target,
                editUrl: result.value.editUrl,
                hasPassword: result.value.hasPassword,
                startsAt: result.value.startsAt,
                expiresAt: result.value.expiresAt,
                createdAt: result.value.createdAt,
            });
            toast.success(tToast("created"));
        } catch (caught) {
            logEvent("error", "shortener.create_failed", { error: describeError(caught) });
            setFailure("storage_unavailable");
        } finally {
            // A Turnstile token is single-use, so the widget is redrawn after
            // every attempt whether it succeeded or not.
            setChallengeToken(null);
            setChallengeReset((value) => value + 1);
            setCreating(false);
        }
    }

    async function handleCopy(value: string) {
        const result = await copyText(value);

        toast[result.ok ? "success" : "error"](result.ok ? tToast("copied") : tToast("copyFailed"));
    }

    function handleReset() {
        setCreated(null);
        setDraft(DEFAULT_DRAFT);
        setToggles(DEFAULT_TOGGLES);
        setFailure(null);
    }

    const hasTarget = draft.target.trim().length > 0;

    return (
        <div className="flex flex-col gap-6">
            <Card className="relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
                <span
                    aria-hidden="true"
                    className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
                />

                <CardHeader>
                    <CardTitle className="text-lg">{t("title")}</CardTitle>
                    <CardDescription>{t("description")}</CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-5">
                    {created !== null ? (
                        <>
                            <CreatedLinkCard
                                link={created}
                                onCopy={(value) => void handleCopy(value)}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                className="w-fit"
                                onClick={handleReset}
                            >
                                <IconPlus className="size-4" stroke={1.8} aria-hidden="true" />
                                {t("createAnother")}
                            </Button>
                        </>
                    ) : (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={targetId} className="text-muted-foreground text-xs">
                                    <span className="leading-[1.3]">{t("targetLabel")}</span>
                                </Label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <Input
                                        id={targetId}
                                        type="url"
                                        inputMode="url"
                                        autoComplete="url"
                                        value={draft.target}
                                        placeholder={t("targetPlaceholder")}
                                        aria-describedby={failure === null ? undefined : errorId}
                                        aria-invalid={failure !== null}
                                        disabled={!available}
                                        onChange={(event) =>
                                            patchDraft({ target: event.target.value })
                                        }
                                        className="min-w-0 flex-1"
                                    />
                                    <Button
                                        type="button"
                                        className="shrink-0"
                                        disabled={
                                            !available ||
                                            creating ||
                                            challengeToken === null ||
                                            !hasTarget
                                        }
                                        onClick={() => void handleCreate()}
                                    >
                                        {creating ? (
                                            <IconLoader2
                                                className="size-4 animate-spin"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                        ) : (
                                            <IconWand
                                                className="size-4"
                                                stroke={1.8}
                                                aria-hidden="true"
                                            />
                                        )}
                                        {t("submit")}
                                    </Button>
                                </div>
                                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {t("targetHint")}
                                </p>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-3">
                                <OptionSwitch
                                    label={t("aliasToggle")}
                                    hint={t("aliasToggleHint")}
                                    checked={toggles.alias}
                                    disabled={!available}
                                    onCheckedChange={(next) => patchToggles({ alias: next })}
                                />
                                <OptionSwitch
                                    label={t("passwordToggle")}
                                    hint={t("passwordToggleHint")}
                                    checked={toggles.password}
                                    disabled={!available}
                                    onCheckedChange={(next) => patchToggles({ password: next })}
                                />
                                <OptionSwitch
                                    label={t("scheduleToggle")}
                                    hint={t("scheduleToggleHint")}
                                    checked={toggles.schedule}
                                    disabled={!available}
                                    onCheckedChange={(next) => patchToggles({ schedule: next })}
                                />
                            </div>

                            {toggles.alias && (
                                <div className="flex flex-col gap-1.5">
                                    <Label
                                        htmlFor={aliasId}
                                        className="text-muted-foreground text-xs"
                                    >
                                        <span className="leading-[1.3]">{t("aliasLabel")}</span>
                                    </Label>
                                    <div className="ring-border/70 focus-within:ring-ring bg-background flex min-w-0 items-center gap-0 overflow-hidden rounded-xl ring-1 ring-inset focus-within:ring-2">
                                        <span className="text-muted-foreground shrink-0 pl-3 font-mono text-[0.75rem] select-none">
                                            {aliasPrefix}
                                        </span>
                                        <Input
                                            id={aliasId}
                                            value={draft.alias}
                                            placeholder={t("aliasPlaceholder")}
                                            autoComplete="off"
                                            spellCheck={false}
                                            onChange={(event) =>
                                                patchDraft({ alias: event.target.value })
                                            }
                                            className="min-w-0 flex-1 border-0 bg-transparent font-mono shadow-none ring-0 focus-visible:ring-0"
                                        />
                                    </div>
                                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                        {t("aliasHint")}
                                    </p>
                                </div>
                            )}

                            {toggles.password && (
                                <div className="flex flex-col gap-1.5">
                                    <Label
                                        htmlFor={passwordId}
                                        className="text-muted-foreground text-xs"
                                    >
                                        <span className="leading-[1.3]">{t("passwordLabel")}</span>
                                    </Label>
                                    <Input
                                        id={passwordId}
                                        type="password"
                                        autoComplete="new-password"
                                        value={draft.password}
                                        placeholder={t("passwordPlaceholder")}
                                        onChange={(event) =>
                                            patchDraft({ password: event.target.value })
                                        }
                                    />
                                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                        {t("passwordHint")}
                                    </p>
                                </div>
                            )}

                            {toggles.schedule && (
                                <div className="flex flex-col gap-1.5">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="flex min-w-0 flex-col gap-1.5">
                                            <Label
                                                htmlFor={startsId}
                                                className="text-muted-foreground text-xs"
                                            >
                                                <span className="leading-[1.3]">
                                                    {t("startsAtLabel")}
                                                </span>
                                            </Label>
                                            <DateTimePicker
                                                id={startsId}
                                                value={draft.startsAt}
                                                defaultTime={SCHEDULE_DEFAULT_TIME.start}
                                                placeholder={tPicker("placeholder")}
                                                timeLabel={tPicker("time")}
                                                clearLabel={tPicker("clear")}
                                                onChange={(startsAt) => patchDraft({ startsAt })}
                                            />
                                        </div>
                                        <div className="flex min-w-0 flex-col gap-1.5">
                                            <Label
                                                htmlFor={expiresId}
                                                className="text-muted-foreground text-xs"
                                            >
                                                <span className="leading-[1.3]">
                                                    {t("expiresAtLabel")}
                                                </span>
                                            </Label>
                                            <DateTimePicker
                                                id={expiresId}
                                                value={draft.expiresAt}
                                                defaultTime={SCHEDULE_DEFAULT_TIME.end}
                                                placeholder={tPicker("placeholder")}
                                                timeLabel={tPicker("time")}
                                                clearLabel={tPicker("clear")}
                                                onChange={(expiresAt) => patchDraft({ expiresAt })}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                        {t("scheduleHint")}
                                    </p>
                                </div>
                            )}

                            {available && turnstileSiteKey !== null && (
                                // The widget has a fixed intrinsic width and
                                // should never stretch to the card. The height
                                // is reserved so nothing below jumps once
                                // Cloudflare's script finishes loading.
                                <div className="min-h-16 w-full max-w-82 min-w-0">
                                    <TurnstileWidget
                                        siteKey={turnstileSiteKey}
                                        action={TURNSTILE_ACTION}
                                        resetSignal={challengeReset}
                                        onVerify={setChallengeToken}
                                        onExpire={() => setChallengeToken(null)}
                                        onError={() => setChallengeToken(null)}
                                    />
                                </div>
                            )}

                            {failure !== null && (
                                <StatusStrip id={errorId} tone="error" message={tErrors(failure)} />
                            )}

                            {failure === null && !available && (
                                <StatusStrip
                                    tone="warning"
                                    message={
                                        storageReady
                                            ? t("challengeUnavailable")
                                            : t("storageUnavailable")
                                    }
                                />
                            )}

                            {failure === null && available && challengeToken === null && (
                                <StatusStrip tone="pending" message={t("challengePending")} />
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <RecentLinksPanel
                entries={history.entries}
                onCopy={(value) => void handleCopy(value)}
                onForget={history.forget}
                onClear={() => {
                    history.clear();
                    toast.success(tToast("historyCleared"));
                }}
            />

            {created !== null && (
                <p className="text-muted-foreground flex items-center gap-1.5 text-[0.6875rem]">
                    <IconArrowRight className="size-3.5" stroke={1.9} aria-hidden="true" />
                    {t("historyNote")}
                </p>
            )}
        </div>
    );
}
