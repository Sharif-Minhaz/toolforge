"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
    ENCODING_LABELS,
    getHashFamily,
    minimumArgon2Memory,
    supportsCaseToggle,
    supportsEncodingChoice,
} from "../domain/algorithms";
import {
    ARGON2_MEMORY_PRESETS,
    BCRYPT_COST_PRESETS,
    DEFAULT_BCRYPT_COST,
    MAX_ARGON2_HASH_LENGTH,
    MAX_ARGON2_ITERATIONS,
    MAX_ARGON2_MEMORY,
    MAX_ARGON2_PARALLELISM,
    MAX_BCRYPT_COST,
    MIN_ARGON2_HASH_LENGTH,
    MIN_ARGON2_ITERATIONS,
    MIN_ARGON2_PARALLELISM,
    MIN_BCRYPT_COST,
} from "../domain/constants";
import { DIGEST_ENCODINGS, type DigestEncoding, type HashOptions } from "../types";
import { NumberField } from "./number-field";

const ENCODING_ITEMS: Record<string, ReactNode> = { ...ENCODING_LABELS };

/** Past this the tab freezes for long enough to be worth warning about. */
const SLOW_BCRYPT_COST = 13;

type OptionSwitchProps = {
    label: string;
    hint: string;
    checked: boolean;
    disabled: boolean;
    onCheckedChange: (checked: boolean) => void;
};

function OptionSwitch({ label, hint, checked, disabled, onCheckedChange }: OptionSwitchProps) {
    const labelId = useId();
    const hintId = useId();

    return (
        <div
            className={cn(
                "bg-card/60 ring-border/70 flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset",
                "transition-opacity duration-200",
                disabled && "opacity-55",
            )}
        >
            <span className="flex min-w-0 flex-col gap-0.5">
                <span id={labelId} className="text-[0.8125rem] leading-[1.3] font-medium">
                    {label}
                </span>
                <span id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {hint}
                </span>
            </span>
            <Switch
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => onCheckedChange(next)}
                aria-labelledby={labelId}
                aria-describedby={hintId}
                className="mt-1 shrink-0"
            />
        </div>
    );
}

type HashOptionsPanelProps = {
    options: HashOptions;
    onChange: (patch: Partial<HashOptions>) => void;
};

/**
 * Only the settings the current family can act on. A control that cannot apply
 * is disabled and says why, rather than sitting there accepting a value that
 * would be silently dropped.
 */
export function HashOptionsPanel({ options, onChange }: HashOptionsPanelProps) {
    const t = useTranslations("hash.workbench.options");
    const encodingLabelId = useId();

    const family = getHashFamily(options.algorithm);
    const encodingAvailable = supportsEncodingChoice(options);
    const caseAvailable = supportsCaseToggle(options);

    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-muted-foreground text-xs leading-[1.3] font-medium">
                {t("title")}
            </h3>

            {family === "digest" && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label id={encodingLabelId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("encodingLabel")}</span>
                        </Label>
                        <Select
                            items={ENCODING_ITEMS}
                            value={options.encoding}
                            disabled={!encodingAvailable}
                            onValueChange={(next) => {
                                if (next !== null) {
                                    onChange({ encoding: next as DigestEncoding });
                                }
                            }}
                        >
                            <SelectTrigger
                                aria-labelledby={encodingLabelId}
                                className="w-full sm:w-40"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DIGEST_ENCODINGS.map((encoding) => (
                                    <SelectItem key={encoding} value={encoding}>
                                        {ENCODING_LABELS[encoding]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {encodingAvailable ? t("encodingHint") : t("encodingDisabled")}
                        </p>
                    </div>

                    <OptionSwitch
                        label={t("uppercaseLabel")}
                        // Base64 is case-significant, so the toggle goes quiet
                        // rather than producing a different, wrong value.
                        hint={caseAvailable ? t("uppercaseHint") : t("uppercaseDisabled")}
                        checked={options.uppercase && caseAvailable}
                        disabled={!caseAvailable}
                        onCheckedChange={(uppercase) => onChange({ uppercase })}
                    />
                </div>
            )}

            {family === "bcrypt" && (
                <NumberField
                    label={t("costLabel")}
                    hint={t("costHint", {
                        min: MIN_BCRYPT_COST,
                        max: MAX_BCRYPT_COST,
                        recommended: DEFAULT_BCRYPT_COST,
                    })}
                    warning={options.bcryptCost >= SLOW_BCRYPT_COST ? t("costSlow") : undefined}
                    value={options.bcryptCost}
                    min={MIN_BCRYPT_COST}
                    max={MAX_BCRYPT_COST}
                    presets={BCRYPT_COST_PRESETS}
                    onChange={(bcryptCost) => onChange({ bcryptCost })}
                />
            )}

            {family === "argon2" && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <NumberField
                        label={t("memoryLabel")}
                        hint={t("memoryHint")}
                        value={options.argon2Memory}
                        // The floor rises with the lane count, so raising
                        // parallelism can never leave memory below what Argon2
                        // will accept.
                        min={minimumArgon2Memory(options.argon2Parallelism)}
                        max={MAX_ARGON2_MEMORY}
                        step={1_024}
                        presets={ARGON2_MEMORY_PRESETS}
                        onChange={(argon2Memory) => onChange({ argon2Memory })}
                    />
                    <NumberField
                        label={t("iterationsLabel")}
                        hint={t("iterationsHint")}
                        value={options.argon2Iterations}
                        min={MIN_ARGON2_ITERATIONS}
                        max={MAX_ARGON2_ITERATIONS}
                        onChange={(argon2Iterations) => onChange({ argon2Iterations })}
                    />
                    <NumberField
                        label={t("parallelismLabel")}
                        hint={t("parallelismHint")}
                        value={options.argon2Parallelism}
                        min={MIN_ARGON2_PARALLELISM}
                        max={MAX_ARGON2_PARALLELISM}
                        onChange={(argon2Parallelism) =>
                            onChange({
                                argon2Parallelism,
                                argon2Memory: Math.max(
                                    options.argon2Memory,
                                    minimumArgon2Memory(argon2Parallelism),
                                ),
                            })
                        }
                    />
                    <NumberField
                        label={t("hashLengthLabel")}
                        hint={t("hashLengthHint")}
                        value={options.argon2HashLength}
                        min={MIN_ARGON2_HASH_LENGTH}
                        max={MAX_ARGON2_HASH_LENGTH}
                        step={4}
                        onChange={(argon2HashLength) => onChange({ argon2HashLength })}
                    />
                </div>
            )}
        </div>
    );
}
