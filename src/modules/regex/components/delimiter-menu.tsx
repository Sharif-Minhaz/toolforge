"use client";

import { useTranslations } from "next-intl";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DELIMITER_CHARACTERS, REGEX_DELIMITERS, type RegexDelimiter } from "../types";

type DelimiterMenuProps = {
    value: RegexDelimiter;
    onChange: (delimiter: RegexDelimiter) => void;
};

/**
 * The delimiter is presentation, not behaviour — it decides how the pattern is
 * written down when it leaves the tool, and therefore which character has to
 * be escaped inside the literal.
 */
export function DelimiterMenu({ value, onChange }: DelimiterMenuProps) {
    const t = useTranslations("regex.workbench");

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <button
                        type="button"
                        aria-label={t("delimiterLabel")}
                        className={cn(
                            "text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center rounded-lg",
                            "hover:bg-muted transition-colors duration-200",
                            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                            "data-popup-open:bg-muted data-popup-open:text-foreground",
                        )}
                    />
                }
            >
                <span aria-hidden="true" className="font-mono text-sm leading-none">
                    ⋮
                </span>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-48" align="start">
                <DropdownMenuLabel>{t("delimiterLabel")}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={value}
                    onValueChange={(next) => {
                        const chosen = REGEX_DELIMITERS.find((candidate) => candidate === next);

                        if (chosen !== undefined) {
                            onChange(chosen);
                        }
                    }}
                >
                    {REGEX_DELIMITERS.map((delimiter) => (
                        <DropdownMenuRadioItem key={delimiter} value={delimiter}>
                            <span
                                aria-hidden="true"
                                className="text-muted-foreground w-4 shrink-0 text-center font-mono"
                            >
                                {DELIMITER_CHARACTERS[delimiter]}
                            </span>
                            <span className="leading-[1.3]">{t(`delimiters.${delimiter}`)}</span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
