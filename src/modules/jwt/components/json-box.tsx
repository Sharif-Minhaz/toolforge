"use client";

import { IconChevronRight } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import type { JwtSegmentName } from "../types";

const CARET_COLOR: Record<JwtSegmentName, string> = {
    header: "text-brand-rose",
    payload: "text-brand-violet",
    signature: "text-brand-cyan",
};

type JsonBoxProps = {
    id: string;
    /** The small caption inside the box header, e.g. "Algorithm & Token Type". */
    label: string;
    part: JwtSegmentName;
    value: string;
    readOnly?: boolean;
    placeholder?: string;
    copyLabel: string;
    copied: boolean;
    onCopy: () => void;
    onChange?: (value: string) => void;
    /** The `StatusStrip` that reports whether the contents parse. */
    status?: ReactNode;
    className?: string;
    textareaClassName?: string;
};

/**
 * One editable or read-only JSON panel. Shared by both directions so the
 * decoder's read-only header and the encoder's editable one stay the same
 * shape, and only the `readOnly` flag differs.
 */
export function JsonBox({
    id,
    label,
    part,
    value,
    readOnly = false,
    placeholder,
    copyLabel,
    copied,
    onCopy,
    onChange,
    status,
    className,
    textareaClassName,
}: JsonBoxProps) {
    return (
        <div
            className={cn(
                "bg-card/60 ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-inset",
                className,
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id} className="text-muted-foreground min-w-0 gap-1 text-xs">
                    <IconChevronRight
                        className={cn("size-3.5 shrink-0", CARET_COLOR[part])}
                        stroke={2.2}
                        aria-hidden="true"
                    />
                    <span className="truncate leading-[1.3]">{label}</span>
                </Label>
                <IconCopyButton copied={copied} onClick={onCopy} aria-label={copyLabel} />
            </div>

            <Textarea
                id={id}
                value={value}
                readOnly={readOnly}
                placeholder={placeholder}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                onChange={(event) => onChange?.(event.target.value)}
                className={cn(
                    "max-h-72 min-h-28 resize-y rounded-lg font-mono text-[0.8125rem] leading-6 break-all",
                    readOnly ? "bg-muted/40" : "bg-background/60",
                    textareaClassName,
                )}
            />

            {status}
        </div>
    );
}
