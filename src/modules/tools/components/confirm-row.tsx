"use client";

import { IconArrowBackUp, IconCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type ConfirmRowProps = {
    label: string;
    confirmLabel: string;
    onCancel: () => void;
    onConfirm: () => void;
    disabled: boolean;
    destructive?: boolean;
};

/**
 * A two-press confirmation, inline rather than in a dialog.
 *
 * These are irreversible and rare, so the question has to be asked — but a modal
 * for "delete this server" traps focus and covers the very page somebody is
 * reading to decide. The row states what will happen and puts the two answers
 * side by side; cancel comes first, so the default target under a stray press is
 * the harmless one.
 *
 * Lifted out of the JSON and GraphQL workbenches when the access-token panel
 * became a third caller.
 */
export function ConfirmRow({
    label,
    confirmLabel,
    onCancel,
    onConfirm,
    disabled,
    destructive = false,
}: ConfirmRowProps) {
    const t = useTranslations("hostedServer.confirm");

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-xs leading-[1.3]">{label}</span>
            <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={t("cancel")}
                onClick={onCancel}
                disabled={disabled}
            >
                {/* Cancel first: the nearest target should be the safe one. */}
                <IconArrowBackUp className="size-3.5" stroke={1.9} aria-hidden="true" />
            </Button>
            <Button
                type="button"
                size="sm"
                variant={destructive ? "destructive" : "default"}
                className="gap-1.5"
                onClick={onConfirm}
                disabled={disabled}
            >
                <IconCheck className="size-3.5" stroke={1.9} aria-hidden="true" />
                {confirmLabel}
            </Button>
        </div>
    );
}
