"use client";

import { useTranslations } from "next-intl";

import { OptionSelect } from "@/modules/tools/components/option-controls";
import {
    COLOR_NOTATIONS,
    HEX_CASINGS,
    type ColorFormatOptions,
    type ColorNotation,
    type HexCasing,
} from "../types";

type ColorOptionsProps = {
    options: ColorFormatOptions;
    onChange: (patch: Partial<ColorFormatOptions>) => void;
};

/** How the format rows spell themselves. Neither option changes the colour. */
export function ColorOptions({ options, onChange }: ColorOptionsProps) {
    const t = useTranslations("color.options");

    const notationLabels: Record<ColorNotation, string> = {
        modern: t("notation.modern"),
        legacy: t("notation.legacy"),
    };

    const casingLabels: Record<HexCasing, string> = {
        lower: t("hexCasing.lower"),
        upper: t("hexCasing.upper"),
    };

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <OptionSelect
                label={t("notation.label")}
                hint={t("notation.hint")}
                value={options.notation}
                items={notationLabels}
                values={COLOR_NOTATIONS}
                onChange={(notation) => onChange({ notation })}
            />

            <OptionSelect
                label={t("hexCasing.label")}
                hint={t("hexCasing.hint")}
                value={options.hexCasing}
                items={casingLabels}
                values={HEX_CASINGS}
                onChange={(hexCasing) => onChange({ hexCasing })}
            />
        </div>
    );
}
