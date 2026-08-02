"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { NumberStepper } from "@/modules/tools/components/number-stepper";
import { OptionSwitch } from "@/modules/tools/components/option-controls";
import { MAX_SLUG_LENGTH, SLUG_LENGTH_PRESETS } from "../domain/constants";
import type { SlugOptions } from "../types";

type SlugOptionsPanelProps = {
    options: SlugOptions;
    /** Raw field text, so a half-typed ceiling is never rewritten under the caret. */
    lengthField: string;
    lengthInvalid: boolean;
    onChange: (patch: Partial<SlugOptions>) => void;
    onLengthChange: (raw: string) => void;
    onLengthCommit: (value: number) => void;
};

export function SlugOptionsPanel({
    options,
    lengthField,
    lengthInvalid,
    onChange,
    onLengthChange,
    onLengthCommit,
}: SlugOptionsPanelProps) {
    const t = useTranslations("slug.workbench");
    const formatter = useFormatter();
    const lengthId = useId();
    const lengthHintId = useId();

    return (
        <div className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <OptionSwitch
                    label={t("lowercaseLabel")}
                    hint={t("lowercaseHint")}
                    checked={options.lowercase}
                    onCheckedChange={(lowercase) => onChange({ lowercase })}
                />
                <OptionSwitch
                    label={t("asciiLabel")}
                    hint={t("asciiHint")}
                    checked={options.ascii}
                    onCheckedChange={(ascii) => onChange({ ascii })}
                />
                <OptionSwitch
                    label={t("stopWordsLabel")}
                    hint={t("stopWordsHint")}
                    checked={options.stripStopWords}
                    onCheckedChange={(stripStopWords) => onChange({ stripStopWords })}
                />
                <OptionSwitch
                    label={t("numbersLabel")}
                    hint={t("numbersHint")}
                    checked={options.stripNumbers}
                    onCheckedChange={(stripNumbers) => onChange({ stripNumbers })}
                />
                <OptionSwitch
                    label={t("perLineLabel")}
                    hint={t("perLineHint")}
                    checked={options.perLine}
                    onCheckedChange={(perLine) => onChange({ perLine })}
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor={lengthId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{t("maxLengthLabel")}</span>
                </Label>
                <NumberStepper
                    value={lengthField}
                    numeric={options.maxLength}
                    min={0}
                    max={MAX_SLUG_LENGTH}
                    presets={SLUG_LENGTH_PRESETS}
                    invalid={lengthInvalid}
                    inputId={lengthId}
                    describedById={lengthHintId}
                    // The ceiling is spent per line in bulk mode, so the hint
                    // says which it is rather than leaving the reader to guess.
                    hint={
                        options.perLine
                            ? t("maxLengthHintPerLine", {
                                  max: formatter.number(MAX_SLUG_LENGTH),
                              })
                            : t("maxLengthHint", { max: formatter.number(MAX_SLUG_LENGTH) })
                    }
                    presetsLabel={t("maxLengthPresets")}
                    decreaseLabel={t("maxLengthDecrease")}
                    increaseLabel={t("maxLengthIncrease")}
                    onChange={onLengthChange}
                    onPreset={onLengthCommit}
                    onStep={(delta) => onLengthCommit(options.maxLength + delta)}
                />
            </div>
        </div>
    );
}
