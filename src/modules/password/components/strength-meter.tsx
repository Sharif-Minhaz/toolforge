"use client";

import {
    IconShieldCheck,
    IconShieldExclamation,
    IconShieldX,
    type IconProps,
} from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { MOTION_EASE } from "@/components/motion/motion-tokens";
import { cn } from "@/lib/utils";
import { COMPACT_NOTATION_CEILING } from "../domain/crack-time";
import {
    PASSWORD_STRENGTHS,
    type AttackModel,
    type CrackTime,
    type PasswordStrength,
} from "../types";

/**
 * Three tones over five bands. The colour carries the verdict — danger, caution,
 * fine — and the length of the bar carries the granularity, so nothing here has
 * to invent a hue the design system does not have.
 */
const TONE: Record<PasswordStrength, { bar: string; text: string }> = {
    "very-weak": { bar: "bg-destructive", text: "text-destructive" },
    weak: { bar: "bg-destructive", text: "text-destructive" },
    fair: { bar: "bg-brand-amber", text: "text-brand-amber" },
    strong: { bar: "bg-[var(--color-success)]", text: "text-[var(--color-success)]" },
    "very-strong": { bar: "bg-[var(--color-success)]", text: "text-[var(--color-success)]" },
};

const TONE_ICON: Record<PasswordStrength, ComponentType<IconProps>> = {
    "very-weak": IconShieldX,
    weak: IconShieldX,
    fair: IconShieldExclamation,
    strong: IconShieldCheck,
    "very-strong": IconShieldCheck,
};

/**
 * The figure alone, formatted for the reader's locale. The universe note is not
 * part of it: the sentence reads "… 2.4T years assuming leaked SHA-256 hashes",
 * and dropping an aside into the middle of that breaks it in both languages.
 */
function CrackTimeText({ crackTime }: { crackTime: CrackTime }) {
    const t = useTranslations("password.crackTime");
    const formatter = useFormatter();

    if (crackTime.kind === "instant") {
        return <span className="font-medium">{t("instant")}</span>;
    }

    if (crackTime.kind === "beyond") {
        return <span className="font-medium">{t("beyond")}</span>;
    }

    return (
        <span className="font-medium">
            {t(crackTime.unit, {
                // `count` picks the plural category; `value` carries the
                // already-formatted figure, so the notation survives.
                count: crackTime.value,
                value: formatter.number(crackTime.value, {
                    // Past the ceiling, compact notation runs out of names and
                    // reads as "410,000,000T". Scientific stays legible.
                    notation: crackTime.value < COMPACT_NOTATION_CEILING ? "compact" : "scientific",
                    maximumFractionDigits: 1,
                }),
            })}
        </span>
    );
}

type StrengthMeterProps = {
    strength: PasswordStrength;
    crackTime: CrackTime;
    attack: AttackModel;
    /** Dims the read-out while a newer result is still pending. */
    stale: boolean;
};

export function StrengthMeter({ strength, crackTime, attack, stale }: StrengthMeterProps) {
    const t = useTranslations("password.workbench");
    const tCrack = useTranslations("password.crackTime");
    const tStrengths = useTranslations("password.strengths");
    const tAttacks = useTranslations("password.attacks");
    const reduceMotion = useReducedMotion();

    const filled = PASSWORD_STRENGTHS.indexOf(strength) + 1;
    const tone = TONE[strength];
    const Icon = TONE_ICON[strength];
    const label = tStrengths(strength);

    return (
        <div
            className={cn(
                "flex min-w-0 flex-col gap-2 transition-opacity duration-200",
                stale && "opacity-55",
            )}
        >
            <div className="flex min-w-0 items-center gap-3">
                <div
                    role="meter"
                    aria-valuenow={filled}
                    aria-valuemin={0}
                    aria-valuemax={PASSWORD_STRENGTHS.length}
                    aria-valuetext={label}
                    aria-label={t("strengthLabel")}
                    className="bg-muted relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
                >
                    <motion.span
                        className={cn("absolute inset-y-0 left-0 rounded-full", tone.bar)}
                        initial={false}
                        animate={{ width: `${(filled / PASSWORD_STRENGTHS.length) * 100}%` }}
                        transition={
                            reduceMotion ? { duration: 0 } : { duration: 0.3, ease: MOTION_EASE }
                        }
                    />
                </div>

                <span
                    className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold",
                        tone.text,
                    )}
                >
                    <Icon className="size-3.5" stroke={1.9} aria-hidden="true" />
                    <span className="leading-[1.3]">{label}</span>
                </span>
            </div>

            <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                <span className="text-foreground font-medium">{t("crackLabel")}</span>{" "}
                <CrackTimeText crackTime={crackTime} />{" "}
                {/* The rate travels with the verdict. A crack time without the
                    attacker it assumes is not an estimate, it is a slogan. */}
                <span className="opacity-80">
                    {t("crackAssumption", { attacker: tAttacks(`${attack}.assumption`) })}
                </span>
                {crackTime.kind === "duration" && crackTime.beyondUniverse ? (
                    <> {tCrack("beyondUniverse")}</>
                ) : null}
            </p>
        </div>
    );
}
