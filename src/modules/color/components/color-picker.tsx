"use client";

import { useTranslations } from "next-intl";

import { formatHex } from "../domain/format";
import { hsvToRgb } from "../domain/convert";
import type { Hsva } from "../types";
import { ChannelSlider } from "./channel-slider";
import { SaturationField } from "./saturation-field";

const HUE_TRACK = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
    .map((hue) => `hsl(${hue} 100% 50%)`)
    .join(", ")})`;

type ColorPickerProps = {
    color: Hsva;
    onChange: (color: Hsva) => void;
};

/** Saturation and value on a square, hue and alpha on their own tracks. */
export function ColorPicker({ color, onChange }: ColorPickerProps) {
    const t = useTranslations("color.picker");
    const opaque = formatHex(hsvToRgb(color), { notation: "modern", hexCasing: "lower" });

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <SaturationField
                hue={color.h}
                saturation={color.s}
                value={color.v}
                label={t("field")}
                valueText={t("fieldValue", {
                    saturation: Math.round(color.s),
                    value: Math.round(color.v),
                })}
                onChange={(saturation, value) => onChange({ ...color, s: saturation, v: value })}
            />

            <ChannelSlider
                label={t("hue")}
                readout={`${Math.round(color.h)}°`}
                value={Math.round(color.h)}
                max={360}
                trackImage={HUE_TRACK}
                onChange={(hue) => onChange({ ...color, h: hue })}
            />

            <ChannelSlider
                label={t("alpha")}
                readout={`${Math.round(color.a * 100)}%`}
                value={Math.round(color.a * 100)}
                max={100}
                overCheckerboard
                trackImage={`linear-gradient(to right, transparent, ${opaque})`}
                onChange={(alpha) => onChange({ ...color, a: alpha / 100 })}
            />
        </div>
    );
}
