"use client";

import {
    IconAt,
    IconLink,
    IconMessage,
    IconPhone,
    IconTypography,
    IconUser,
    IconWifi,
    type IconProps,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import { QR_PAYLOAD_KINDS, type QrPayloadKind } from "../types";

const KIND_ICONS: Record<QrPayloadKind, ComponentType<IconProps>> = {
    url: IconLink,
    text: IconTypography,
    wifi: IconWifi,
    contact: IconUser,
    sms: IconMessage,
    email: IconAt,
    phone: IconPhone,
};

type QrTypeSelectorProps = {
    value: QrPayloadKind;
    labelId: string;
    onChange: (kind: QrPayloadKind) => void;
};

/**
 * The seven payload kinds, as a radio group rather than seven buttons: arrow
 * keys move between them and only the active one is a tab stop, which is what a
 * screen reader announces as "one of seven".
 */
export function QrTypeSelector({ value, labelId, onChange }: QrTypeSelectorProps) {
    const t = useTranslations("qr.kinds");

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
            {QR_PAYLOAD_KINDS.map((kind) => {
                const Icon = KIND_ICONS[kind];
                const active = kind === value;

                return (
                    <button
                        key={kind}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => onChange(kind)}
                        className={cn(
                            "flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3",
                            "ring-1 transition-all duration-200 ring-inset",
                            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                            active
                                ? "bg-primary/8 text-foreground ring-primary/40"
                                : "bg-card/60 text-muted-foreground hover:text-foreground ring-border/70 hover:bg-card",
                        )}
                    >
                        <Icon
                            className={cn("size-4.5", active && "text-primary")}
                            stroke={1.8}
                            aria-hidden="true"
                        />
                        <span className="truncate text-xs leading-[1.3] font-medium">
                            {t(kind)}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
