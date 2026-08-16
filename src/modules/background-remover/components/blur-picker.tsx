"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import { Slider } from "@/components/ui/slider";
import type { PixelSize } from "@/modules/tools/types";

import { clampBlurStrength } from "../domain/background";
import { blurRadiusPx } from "../domain/compose-geometry";
import { DEFAULT_BLUR_STRENGTH, MAX_BLUR_STRENGTH, MIN_BLUR_STRENGTH } from "../domain/constants";
import type { BackgroundChoice } from "../types";

type BlurPickerProps = {
    readonly value: BackgroundChoice;
    /** The source's own dimensions, so the hint can quote a real pixel radius. */
    readonly size: PixelSize;
    readonly disabled: boolean;
    readonly onChange: (choice: BackgroundChoice) => void;
};

/**
 * The Blur tab: the picture's own background, thrown out of focus behind it.
 *
 * The one background here that needs no network and no upload — it is the
 * reader's own photograph twice, once soft and once sharp, which is what a phone
 * camera's portrait mode does and the reason it is the first tab rather than an
 * afterthought.
 *
 * The strength is 1–100 rather than a pixel radius because a radius means
 * something different on every picture: eight pixels is heavy on a 600 px
 * thumbnail and invisible on a 6000 px photograph. The real radius is shown
 * underneath, so the number is honest without being the control.
 */
export function BlurPicker({ value, size, disabled, onChange }: BlurPickerProps) {
    const t = useTranslations("backgroundRemover.backgrounds");
    const formatter = useFormatter();

    const labelId = useId();

    const strength = value.kind === "blur" ? value.strength : DEFAULT_BLUR_STRENGTH;
    const radius = blurRadiusPx(size, strength);

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-center gap-3">
                <span
                    id={labelId}
                    className="text-muted-foreground shrink-0 text-[0.8125rem] leading-[1.4]"
                >
                    {t("blur.strength")}
                </span>

                <Slider
                    aria-labelledby={labelId}
                    value={strength}
                    min={MIN_BLUR_STRENGTH}
                    max={MAX_BLUR_STRENGTH}
                    disabled={disabled}
                    // A discrete drag, not a keystroke: the composite is redrawn
                    // when it settles, and `CLAUDE.md`'s debounce tree says a
                    // control the derived value feeds back into is never
                    // debounced. The workbench recomposes on the settled value.
                    onValueChange={(next) =>
                        onChange({
                            kind: "blur",
                            strength: clampBlurStrength(
                                Array.isArray(next) ? (next[0] ?? strength) : next,
                            ),
                        })
                    }
                    className="min-w-0 flex-1"
                />

                <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums">
                    {formatter.number(strength)}
                </span>
            </div>

            <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                {t("blur.hint", { radius: formatter.number(radius) })}
            </p>
        </div>
    );
}
