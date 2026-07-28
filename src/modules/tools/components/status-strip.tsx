"use client";

import {
    IconAlertTriangle,
    IconCircleCheck,
    IconLoader2,
    IconPointFilled,
    type IconProps,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

export type StatusTone = "success" | "error" | "warning" | "pending" | "idle";

const TONE_TEXT: Record<StatusTone, string> = {
    success: "text-[var(--color-success)]",
    error: "text-destructive",
    warning: "text-brand-amber",
    pending: "text-muted-foreground",
    idle: "text-muted-foreground",
};

const TONE_ICON: Record<StatusTone, ComponentType<IconProps>> = {
    success: IconCircleCheck,
    error: IconAlertTriangle,
    warning: IconAlertTriangle,
    pending: IconLoader2,
    idle: IconPointFilled,
};

type StatusStripProps = {
    tone: StatusTone;
    message: string;
    /** Set when an input points at this line through `aria-describedby`. */
    id?: string;
    className?: string;
};

/**
 * The one-line verdict under a box. `role="status"` rather than `alert`: these
 * change on every keystroke, and an assertive live region would interrupt a
 * screen reader mid-word.
 */
export function StatusStrip({ tone, message, id, className }: StatusStripProps) {
    const Icon = TONE_ICON[tone];

    return (
        <p
            id={id}
            role="status"
            className={cn(
                "flex items-start gap-1.5 text-[0.6875rem] leading-normal",
                TONE_TEXT[tone],
                className,
            )}
        >
            <Icon
                className={cn("mt-px size-3.5 shrink-0", tone === "pending" && "animate-spin")}
                stroke={1.9}
                aria-hidden="true"
            />
            <span>{message}</span>
        </p>
    );
}
