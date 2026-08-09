"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RSA_KEY_KINDS, type RsaKeyKind } from "@/modules/tools/types";

type KeyKindToggleProps = {
    value: RsaKeyKind;
    /**
     * False under Decrypt, where a public key cannot work at all — the private
     * exponent is the only number that undoes the public one, and it is not in a
     * public key. Disabled with a hint rather than silently ignored.
     */
    enabled: boolean;
    onChange: (kind: RsaKeyKind) => void;
};

/** Which half of the pair is in the box below. */
export function KeyKindToggle({ value, enabled, onChange }: KeyKindToggleProps) {
    const t = useTranslations("rsaEncrypt.workbench");
    const labelId = useId();

    return (
        <div className={cn("flex min-w-0 flex-col gap-1.5", !enabled && "opacity-55")}>
            <Label id={labelId} className="text-muted-foreground text-xs">
                <span className="leading-[1.3]">{t("keyKindLabel")}</span>
            </Label>

            <div
                role="radiogroup"
                aria-labelledby={labelId}
                className="bg-muted/70 ring-border/60 grid grid-cols-2 gap-1 rounded-xl p-1 ring-1 ring-inset"
            >
                {RSA_KEY_KINDS.map((kind) => {
                    const selected = kind === value;

                    return (
                        <button
                            key={kind}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={!enabled}
                            onClick={() => onChange(kind)}
                            className={cn(
                                "flex h-7 items-center justify-center rounded-lg px-2 text-[0.8125rem] font-medium",
                                "transition-colors duration-200 outline-none",
                                "focus-visible:ring-ring focus-visible:ring-2",
                                "disabled:cursor-not-allowed",
                                selected
                                    ? "bg-card ring-border text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <span className="leading-[1.3]">{t(`keyKind.${kind}`)}</span>
                        </button>
                    );
                })}
            </div>

            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {enabled ? t("keyKindHint") : t("keyKindDisabled")}
            </p>
        </div>
    );
}
