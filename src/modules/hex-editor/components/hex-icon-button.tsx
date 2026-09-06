"use client";

import type { IconProps } from "@tabler/icons-react";
import type { ComponentType } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The square icon button the toolbar and the find bar are both built from.
 *
 * Icon-only by design: the toolbar has to stay one row at 390 px. The name and
 * the shortcut live in the tooltip and in `aria-label`, so nothing is announced
 * only by a picture, and a shortcut is still discoverable by anyone who hovers
 * or focuses the control.
 */
export type HexIconButtonProps = {
    label: string;
    shortcut?: string;
    Icon: ComponentType<IconProps>;
    onClick: () => void;
    disabled?: boolean;
    /** Set on a control that toggles something, which reads it out as pressed. */
    pressed?: boolean;
};

export function HexIconButton({
    label,
    shortcut,
    Icon,
    onClick,
    disabled,
    pressed,
}: HexIconButtonProps) {
    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <button
                        type="button"
                        onClick={onClick}
                        disabled={disabled}
                        aria-label={label}
                        aria-pressed={pressed}
                        className={cn(
                            "text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg",
                            "hover:bg-muted hover:text-foreground transition-colors duration-200",
                            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                            "disabled:pointer-events-none disabled:opacity-40",
                            pressed === true && "bg-muted text-foreground",
                        )}
                    >
                        <Icon className="size-4" stroke={1.8} aria-hidden="true" />
                    </button>
                }
            />
            <TooltipContent>
                {label}
                {shortcut !== undefined && (
                    <span className="text-muted-foreground ml-1.5 font-mono text-[0.6875rem]">
                        {shortcut}
                    </span>
                )}
            </TooltipContent>
        </Tooltip>
    );
}
