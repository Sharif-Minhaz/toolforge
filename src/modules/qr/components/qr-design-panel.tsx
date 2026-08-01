"use client";

import { IconPhotoUp, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useRef } from "react";

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import {
    DEFAULT_BACKGROUND,
    LOGO_ACCEPT_ATTRIBUTE,
    LOGO_SCALE_RANGE,
    MARGIN_RANGE,
    PIXEL_SIZE_PRESETS,
    TRANSPARENT_BACKGROUND,
} from "../domain/constants";
import { supportsLevelChoice } from "../domain/options";
import {
    QR_DOT_STYLES,
    QR_ERROR_LEVELS,
    QR_EYE_STYLES,
    type QrDotStyle,
    type QrErrorLevel,
    type QrEyeStyle,
    type QrOptions,
} from "../types";

type ColorFieldProps = {
    label: string;
    value: string;
    disabled?: boolean;
    onChange: (value: string) => void;
};

/**
 * A swatch and the hex beside it. Both write the same value: the picker is the
 * fast way in, and the text field is the only way to paste a brand colour.
 */
function ColorField({ label, value, disabled, onChange }: ColorFieldProps) {
    const id = useId();
    const swatch = value === TRANSPARENT_BACKGROUND ? DEFAULT_BACKGROUND : value;

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id} className="text-muted-foreground text-xs">
                <span className="leading-[1.3]">{label}</span>
            </Label>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    aria-label={label}
                    disabled={disabled}
                    value={swatch}
                    onChange={(event) => onChange(event.target.value)}
                    className={cn(
                        "ring-border/70 size-9 shrink-0 cursor-pointer rounded-lg bg-transparent ring-1 ring-inset",
                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                        "disabled:cursor-not-allowed disabled:opacity-55",
                    )}
                />
                <Input
                    id={id}
                    value={value}
                    disabled={disabled}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => onChange(event.target.value)}
                    className="font-mono text-xs"
                />
            </div>
        </div>
    );
}

type QrDesignPanelProps = {
    options: QrOptions;
    /** Set when the two colours are too close for a camera to separate. */
    lowContrast: boolean;
    onChange: (patch: Partial<QrOptions>) => void;
    onLogoPick: (file: File) => void;
};

export function QrDesignPanel({ options, lowContrast, onChange, onLogoPick }: QrDesignPanelProps) {
    const t = useTranslations("qr.workbench.design");
    const tLevels = useTranslations("qr.errorLevels");
    const tDots = useTranslations("qr.dotStyles");
    const tEyes = useTranslations("qr.eyeStyles");

    const marginLabelId = useId();
    const logoScaleLabelId = useId();
    const sizeLabelId = useId();
    const fileRef = useRef<HTMLInputElement>(null);

    const levelChoosable = supportsLevelChoice(options);

    return (
        <Accordion className="gap-0">
            <AccordionItem
                value={0}
                className="bg-card/60 ring-border/70 rounded-xl px-4 ring-1 ring-inset not-last:border-b-0"
            >
                <AccordionTrigger className="gap-4 rounded-xl py-3.5 text-[0.9375rem] leading-6 font-medium hover:no-underline">
                    {t("title")}
                </AccordionTrigger>

                <AccordionContent className="flex flex-col gap-4 pb-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <ColorField
                            label={t("foreground")}
                            value={options.foreground}
                            onChange={(foreground) => onChange({ foreground })}
                        />
                        <ColorField
                            label={t("background")}
                            value={options.background}
                            disabled={options.background === TRANSPARENT_BACKGROUND}
                            onChange={(background) => onChange({ background })}
                        />
                    </div>

                    <OptionSwitch
                        label={t("transparent")}
                        hint={t("transparentHint")}
                        checked={options.background === TRANSPARENT_BACKGROUND}
                        onCheckedChange={(checked) =>
                            onChange({
                                background: checked ? TRANSPARENT_BACKGROUND : DEFAULT_BACKGROUND,
                            })
                        }
                    />

                    {lowContrast && (
                        <p className="text-brand-amber text-[0.6875rem] leading-[1.4]">
                            {t("contrastWarning")}
                        </p>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <OptionSelect<QrDotStyle>
                            label={t("dotStyle")}
                            value={options.dotStyle}
                            values={QR_DOT_STYLES}
                            items={Object.fromEntries(
                                QR_DOT_STYLES.map((value) => [value, tDots(value)]),
                            )}
                            onChange={(dotStyle) => onChange({ dotStyle })}
                        />
                        <OptionSelect<QrEyeStyle>
                            label={t("eyeStyle")}
                            value={options.eyeStyle}
                            values={QR_EYE_STYLES}
                            items={Object.fromEntries(
                                QR_EYE_STYLES.map((value) => [value, tEyes(value)]),
                            )}
                            onChange={(eyeStyle) => onChange({ eyeStyle })}
                        />
                    </div>

                    <OptionSelect<QrErrorLevel>
                        label={t("errorLevel")}
                        // A logo takes the choice away rather than silently
                        // overriding it, and the hint says which one is in force.
                        hint={levelChoosable ? t("errorLevelHint") : t("errorLevelLocked")}
                        value={levelChoosable ? options.level : "H"}
                        values={QR_ERROR_LEVELS}
                        disabled={!levelChoosable}
                        items={Object.fromEntries(
                            QR_ERROR_LEVELS.map((value) => [value, tLevels(value)]),
                        )}
                        onChange={(level) => onChange({ level })}
                    />

                    <div className="flex flex-col gap-2">
                        <div className="flex items-baseline justify-between gap-3">
                            <Label id={marginLabelId} className="text-muted-foreground text-xs">
                                <span className="leading-[1.3]">{t("margin")}</span>
                            </Label>
                            <span className="text-muted-foreground font-mono text-[0.6875rem]">
                                {options.margin}
                            </span>
                        </div>
                        <Slider
                            aria-labelledby={marginLabelId}
                            min={MARGIN_RANGE.min}
                            max={MARGIN_RANGE.max}
                            step={1}
                            value={options.margin}
                            onValueChange={(value) =>
                                onChange({ margin: Array.isArray(value) ? value[0] : value })
                            }
                        />
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("marginHint")}
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("logo")}</span>
                        </Label>

                        <input
                            ref={fileRef}
                            type="file"
                            accept={LOGO_ACCEPT_ATTRIBUTE}
                            className="sr-only"
                            onChange={(event) => {
                                const file = event.target.files?.[0];

                                if (file) {
                                    onLogoPick(file);
                                }

                                // Cleared so picking the same file twice still fires.
                                event.target.value = "";
                            }}
                        />

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => fileRef.current?.click()}
                            >
                                <IconPhotoUp className="size-4" stroke={1.8} aria-hidden="true" />
                                {options.logo === null ? t("logoPick") : t("logoReplace")}
                            </Button>

                            {options.logo !== null && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onChange({ logo: null })}
                                >
                                    <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                                    {t("logoRemove")}
                                </Button>
                            )}
                        </div>

                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("logoHint")}
                        </p>
                    </div>

                    {options.logo !== null && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-baseline justify-between gap-3">
                                <Label
                                    id={logoScaleLabelId}
                                    className="text-muted-foreground text-xs"
                                >
                                    <span className="leading-[1.3]">{t("logoScale")}</span>
                                </Label>
                                <span className="text-muted-foreground font-mono text-[0.6875rem]">
                                    {Math.round(options.logo.scale * 100)}%
                                </span>
                            </div>
                            <Slider
                                aria-labelledby={logoScaleLabelId}
                                min={LOGO_SCALE_RANGE.min}
                                max={LOGO_SCALE_RANGE.max}
                                step={LOGO_SCALE_RANGE.step}
                                value={options.logo.scale}
                                onValueChange={(value) => {
                                    if (options.logo === null) {
                                        return;
                                    }

                                    onChange({
                                        logo: {
                                            ...options.logo,
                                            scale: Array.isArray(value) ? value[0] : value,
                                        },
                                    });
                                }}
                            />
                            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {t("logoScaleHint")}
                            </p>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <Label id={sizeLabelId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("pixelSize")}</span>
                        </Label>
                        <div
                            role="group"
                            aria-labelledby={sizeLabelId}
                            className="flex flex-wrap gap-1.5"
                        >
                            {PIXEL_SIZE_PRESETS.map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    aria-pressed={options.pixelSize === preset}
                                    onClick={() => onChange({ pixelSize: preset })}
                                    className={cn(
                                        "rounded-lg px-2.5 py-1 font-mono text-[0.6875rem] ring-1 transition-colors duration-200 ring-inset",
                                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                        options.pixelSize === preset
                                            ? "bg-primary/10 text-foreground ring-primary/40"
                                            : "text-muted-foreground hover:text-foreground ring-border/70 hover:bg-muted",
                                    )}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t("pixelSizeHint")}
                        </p>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}
