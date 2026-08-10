"use client";

import { useTranslations } from "next-intl";

import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ARTICLE_TAGS } from "@/modules/tools/components/article-section";
import { FLAG_LETTERS, formatFlagLetters } from "../domain/flags";
import { REGEX_FLAGS, type RegexFlag } from "../types";

type FlagsMenuProps = {
    value: readonly RegexFlag[];
    onToggle: (flag: RegexFlag) => void;
};

export function FlagsMenu({ value, onToggle }: FlagsMenuProps) {
    const t = useTranslations("regex.workbench");
    const letters = formatFlagLetters(value);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <button
                        type="button"
                        aria-label={t("flagsLabel")}
                        className={cn(
                            "text-brand-emerald hover:bg-muted flex h-7 min-w-9 shrink-0 items-center justify-center rounded-lg px-1.5",
                            "font-mono text-[0.8125rem] leading-[1.3] transition-colors duration-200",
                            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                            "data-popup-open:bg-muted",
                            letters.length === 0 && "text-muted-foreground",
                        )}
                    />
                }
            >
                {letters.length === 0 ? t("noFlags") : letters}
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-72" align="end">
                <DropdownMenuLabel>{t("flagsLabel")}</DropdownMenuLabel>
                {REGEX_FLAGS.map((flag) => (
                    <DropdownMenuCheckboxItem
                        key={flag}
                        checked={value.includes(flag)}
                        onCheckedChange={() => onToggle(flag)}
                        className="items-start py-1.5"
                    >
                        <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="flex items-center gap-2 leading-[1.3] font-medium">
                                <span aria-hidden="true" className="text-brand-emerald font-mono">
                                    {FLAG_LETTERS[flag]}
                                </span>
                                {t(`flags.${flag}.name`)}
                            </span>
                            <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {t.rich(`flags.${flag}.hint`, ARTICLE_TAGS)}
                            </span>
                        </span>
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
