"use client";

import { IconChevronDown } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import {
    DEFAULT_PUBLIC_EXPONENT,
    MAX_PUBLIC_EXPONENT_LENGTH,
    PORTABLE_PUBLIC_EXPONENTS,
} from "../domain/constants";

/**
 * The one parameter a reader rarely changes and occasionally has to.
 *
 * Native `<details>` rather than the vendor Accordion, which unmounts its panel
 * when closed — folding this away while an exponent is half-typed would throw
 * the half away, and the AES workbench's advanced panel is native for the same
 * reason.
 */

type AdvancedSettingsProps = {
    value: string;
    /** True once what is typed is not a public exponent at all. */
    invalid: boolean;
    /** True for a legal exponent no browser will actually mint a key for. */
    unportable: boolean;
    onChange: (value: string) => void;
};

export function AdvancedSettings({ value, invalid, unportable, onChange }: AdvancedSettingsProps) {
    const t = useTranslations("rsa.workbench.advanced");

    const inputId = useId();
    const hintId = useId();
    const statusId = useId();

    return (
        <details className="bg-card/60 ring-border/70 group/advanced min-w-0 rounded-xl ring-1 ring-inset">
            <summary
                className={cn(
                    "flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    "[&::-webkit-details-marker]:hidden",
                )}
            >
                <IconChevronDown
                    className="text-muted-foreground size-4 shrink-0 -rotate-90 transition-transform duration-200 group-open/advanced:rotate-0"
                    stroke={1.9}
                    aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-[0.8125rem] leading-[1.3] font-medium">
                    {t("title")}
                </span>
            </summary>

            <div className="flex flex-col gap-1.5 px-3 pt-1 pb-3">
                <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{t("exponentLabel")}</span>
                </Label>

                {/* Capped rather than metered. This is a short identity field:
                    an eleventh digit is a mistake every time, and refusing the
                    keystroke costs nothing. */}
                <Input
                    id={inputId}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    maxLength={MAX_PUBLIC_EXPONENT_LENGTH}
                    inputMode="numeric"
                    spellCheck={false}
                    autoComplete="off"
                    aria-describedby={`${hintId} ${statusId}`}
                    aria-invalid={invalid}
                    className="h-9 rounded-xl font-mono text-[0.8125rem]"
                />

                <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {t("exponentHint", {
                        common: DEFAULT_PUBLIC_EXPONENT,
                        hex: `0x${DEFAULT_PUBLIC_EXPONENT.toString(16)}`,
                    })}
                </p>

                {/* The complaint about the field sits beside the field. What
                    happens to the *operation* is said down at the button. */}
                {invalid ? (
                    <StatusStrip id={statusId} tone="error" message={t("exponentInvalid")} />
                ) : unportable ? (
                    <StatusStrip
                        id={statusId}
                        tone="warning"
                        message={t("exponentUnportable", {
                            values: PORTABLE_PUBLIC_EXPONENTS.join(" · "),
                        })}
                    />
                ) : (
                    <span id={statusId} className="sr-only">
                        {t("exponentValid")}
                    </span>
                )}
            </div>
        </details>
    );
}
