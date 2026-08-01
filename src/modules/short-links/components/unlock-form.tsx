"use client";

import { IconLoader2, IconLock } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { unlockLink } from "../actions/unlock-link";
import type { UnlockFailureReason } from "../types";

/**
 * The gate in front of a password-protected link.
 *
 * The destination is not in this component's props, and was never sent to the
 * page — it arrives only in the action's reply, once the password checked out.
 * A locked link therefore gives away nothing to somebody reading the HTML.
 */
export function UnlockForm({ slug }: { slug: string }) {
    const t = useTranslations("shortLinks.unlock");
    const tErrors = useTranslations("shortLinks.unlock.errors");

    const passwordId = useId();
    const errorId = useId();

    const [password, setPassword] = useState("");
    const [pending, setPending] = useState(false);
    const [failure, setFailure] = useState<UnlockFailureReason | null>(null);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setPending(true);
        setFailure(null);

        try {
            const result = await unlockLink({ slug, password });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            // `replace` rather than `assign`: the gate should not sit in the
            // back button between the visitor and where they were going.
            window.location.replace(result.target);
        } catch (caught) {
            logEvent("error", "shortLinks.unlock_failed", { error: describeError(caught) });
            setFailure("missing");
        } finally {
            setPending(false);
        }
    }

    return (
        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor={passwordId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{t("passwordLabel")}</span>
                </Label>
                <Input
                    id={passwordId}
                    type="password"
                    autoComplete="off"
                    autoFocus
                    required
                    value={password}
                    placeholder={t("passwordPlaceholder")}
                    aria-describedby={failure === null ? undefined : errorId}
                    aria-invalid={failure !== null}
                    onChange={(event) => setPassword(event.target.value)}
                />
            </div>

            {failure !== null && (
                <StatusStrip id={errorId} tone="error" message={tErrors(failure)} />
            )}

            <Button type="submit" className="w-fit" disabled={pending || password.length === 0}>
                {pending ? (
                    <IconLoader2 className="size-4 animate-spin" stroke={1.8} aria-hidden="true" />
                ) : (
                    <IconLock className="size-4" stroke={1.8} aria-hidden="true" />
                )}
                {pending ? t("opening") : t("submit")}
            </Button>

            <p className="text-muted-foreground max-w-[52ch] text-[0.6875rem] leading-[1.5]">
                {t("hint")}
            </p>
        </form>
    );
}
