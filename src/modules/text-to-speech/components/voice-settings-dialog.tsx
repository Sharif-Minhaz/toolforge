"use client";

import { IconAdjustmentsHorizontal, IconRotate } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { OptionSwitch } from "@/modules/tools/components/option-controls";

import { PROSODY_MAX, PROSODY_MIN } from "../domain/constants";
import { clampProsody, isDefaultSettings } from "../domain/prosody";
import { PROSODY_CONTROLS, type ProsodyControl, type SpeechSettings } from "../types";

type VoiceSettingsDialogProps = {
    readonly settings: SpeechSettings;
    /** Whether the settings are kept in this browser. */
    readonly kept: boolean;
    readonly disabled: boolean;
    readonly onChange: (settings: SpeechSettings) => void;
    readonly onKeptChange: (kept: boolean) => void;
};

/**
 * Rate, volume and pitch, behind the gear beside the voice pickers.
 *
 * A dialog rather than inline sliders because most readers never touch them,
 * and three sliders under the text box would push Generate below the fold on a
 * phone. The gear says when they are not at their defaults, so a changed
 * setting is never a hidden one.
 */
export function VoiceSettingsDialog({
    settings,
    kept,
    disabled,
    onChange,
    onKeptChange,
}: VoiceSettingsDialogProps) {
    const t = useTranslations("textToSpeech.settings");
    const formatter = useFormatter();
    const changed = !isDefaultSettings(settings);

    const formatValue = (control: ProsodyControl, value: number) => {
        const signed = formatter.number(value, { signDisplay: "exceptZero" });

        return control === "pitch"
            ? t("hertz", { value: signed })
            : t("percent", { value: signed });
    };

    return (
        <Dialog>
            <DialogTrigger
                render={
                    <Button
                        variant="outline"
                        size="icon"
                        disabled={disabled}
                        aria-label={changed ? t("openChanged") : t("open")}
                        className="relative size-10 shrink-0 rounded-full"
                    />
                }
            >
                <IconAdjustmentsHorizontal className="size-4.5" stroke={1.8} aria-hidden="true" />
                {changed && (
                    <span
                        aria-hidden="true"
                        className="bg-primary ring-background absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2"
                    />
                )}
            </DialogTrigger>

            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-5">
                    {PROSODY_CONTROLS.map((control) => (
                        <ProsodySlider
                            key={control}
                            label={t(control)}
                            value={settings[control]}
                            formatValue={(value) => formatValue(control, value)}
                            minLabel={formatter.number(PROSODY_MIN, { signDisplay: "exceptZero" })}
                            zeroLabel={formatter.number(0)}
                            maxLabel={formatter.number(PROSODY_MAX, { signDisplay: "exceptZero" })}
                            onChange={(value) => onChange({ ...settings, [control]: value })}
                        />
                    ))}
                </div>

                <OptionSwitch
                    label={t("keep")}
                    hint={t("keepHint")}
                    checked={kept}
                    onCheckedChange={onKeptChange}
                />

                <Button
                    variant="outline"
                    onClick={() => onChange({ rate: 0, volume: 0, pitch: 0 })}
                    disabled={!changed}
                    className="h-9 w-full"
                >
                    <IconRotate className="size-4" stroke={1.8} aria-hidden="true" />
                    {t("reset")}
                </Button>
            </DialogContent>
        </Dialog>
    );
}

type ProsodySliderProps = {
    readonly label: string;
    readonly value: number;
    readonly formatValue: (value: number) => string;
    readonly minLabel: string;
    readonly zeroLabel: string;
    readonly maxLabel: string;
    readonly onChange: (value: number) => void;
};

function ProsodySlider({
    label,
    value,
    formatValue,
    minLabel,
    zeroLabel,
    maxLabel,
    onChange,
}: ProsodySliderProps) {
    const labelId = useId();

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
                <span id={labelId} className="text-sm leading-[1.3] font-medium">
                    {label}
                </span>
                <span className="bg-muted rounded-md px-2 py-0.5 font-mono text-xs tabular-nums">
                    {formatValue(value)}
                </span>
            </div>
            <Slider
                aria-labelledby={labelId}
                // An array, so the wrapper draws exactly one thumb.
                value={[value]}
                min={PROSODY_MIN}
                max={PROSODY_MAX}
                step={1}
                onValueChange={(next) =>
                    onChange(clampProsody(Array.isArray(next) ? (next[0] ?? value) : next))
                }
            />
            <div
                aria-hidden="true"
                className="text-muted-foreground flex justify-between font-mono text-[0.6875rem] tabular-nums"
            >
                <span>{minLabel}</span>
                <span>{zeroLabel}</span>
                <span>{maxLabel}</span>
            </div>
        </div>
    );
}
