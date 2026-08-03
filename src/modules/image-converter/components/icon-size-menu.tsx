"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ICON_SIZES, type IconSize } from "../types";

type IconSizeMenuProps = {
    value: readonly IconSize[];
    disabled?: boolean;
    /** Set when the sizes are fixed by the target rather than chosen. */
    hint: string;
    onToggle: (size: IconSize) => void;
};

/**
 * The square sizes that go inside an `.ico`.
 *
 * A checkbox menu rather than six switches: they are one setting with six
 * values, and six switches would be taller than every other control on the
 * panel put together. The last checked entry cannot be cleared — an `.ico` with
 * no images in it is a file nothing can use — so its item is disabled instead
 * of accepting the click and silently putting the size back.
 *
 * The pixel counts are data, not copy, so they stay in Western digits in both
 * locales: they are the numbers a person types into a build config.
 */
export function IconSizeMenu({ value, disabled, hint, onToggle }: IconSizeMenuProps) {
    const t = useTranslations("imageConverter.workbench");
    const labelId = useId();
    const hintId = useId();

    const isLast = value.length === 1;

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label id={labelId} className="text-muted-foreground text-xs">
                <span className="leading-[1.3]">{t("sizesLabel")}</span>
            </Label>

            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <button
                            type="button"
                            disabled={disabled}
                            aria-labelledby={labelId}
                            aria-describedby={hintId}
                            className={cn(
                                "border-input dark:bg-input/30 flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-transparent px-3 py-2 text-sm",
                                "transition-colors duration-200 outline-none",
                                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                                "data-popup-open:border-ring",
                            )}
                        />
                    }
                >
                    <span className="truncate tabular-nums">{value.join(", ")}</span>
                    <span className="text-muted-foreground shrink-0 text-[0.6875rem] leading-[1.3]">
                        {t("sizesSummary", { count: value.length })}
                    </span>
                </DropdownMenuTrigger>

                <DropdownMenuContent className="w-56" align="start">
                    {ICON_SIZES.map((size) => {
                        const checked = value.includes(size);

                        return (
                            <DropdownMenuCheckboxItem
                                key={size}
                                checked={checked}
                                disabled={checked && isLast}
                                onCheckedChange={() => onToggle(size)}
                            >
                                <span className="tabular-nums">{t("sizesValue", { size })}</span>
                            </DropdownMenuCheckboxItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>

            <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {isLast && !disabled ? t("sizesLastHint") : hint}
            </p>
        </div>
    );
}
