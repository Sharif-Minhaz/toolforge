"use client";

import { IconBan, IconCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { parseHexColor } from "../domain/background";
import { DEFAULT_BACKGROUND_COLOR } from "../domain/constants";
import { needsSwatchOutline, SWATCHES } from "../domain/palette";
import type { BackgroundChoice } from "../types";

type ColorPickerProps = {
    readonly value: BackgroundChoice;
    readonly disabled: boolean;
    readonly onChange: (choice: BackgroundChoice) => void;
};

/**
 * The Colour tab: nothing at all, twenty presets, and a colour of your own.
 *
 * The ⊘ tile is the first swatch rather than a separate control, because
 * "transparent" is the answer to the same question the other twenty answer —
 * what goes behind the subject — and putting it in a different place would make
 * the most common choice the hardest one to find.
 */
export function ColorPicker({ value, disabled, onChange }: ColorPickerProps) {
    const t = useTranslations("backgroundRemover.backgrounds");

    const customId = useId();
    const nativeId = useId();

    /**
     * The text field's own draft, kept apart from the committed colour.
     *
     * Typing `#ff3b30` passes through `#f`, `#ff`, `#ff3` — and `#fff` is a valid
     * colour. Feeding every keystroke straight to the canvas would repaint the
     * background white halfway through typing red, so the field holds its own
     * string and only a value that parses is committed. This is the third branch
     * of `CLAUDE.md`'s debounce tree: an input controlled by the derived value is
     * never debounced, it is kept separate.
     */
    const [draft, setDraft] = useState(value.kind === "color" ? value.color : "");

    const selectedColor = value.kind === "color" ? value.color : null;
    const nativeValue = selectedColor ?? DEFAULT_BACKGROUND_COLOR;

    function commit(raw: string) {
        setDraft(raw);

        const parsed = parseHexColor(raw);

        if (parsed !== null) {
            onChange({ kind: "color", color: parsed });
        }
    }

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {/* Scrolls in its own box, for the same reason the photo grid does. */}
            <ul className="-mr-1 grid max-h-64 grid-cols-6 gap-2 overflow-y-auto pr-1">
                <li>
                    <button
                        type="button"
                        disabled={disabled}
                        aria-pressed={value.kind === "transparent"}
                        aria-label={t("color.transparent")}
                        onClick={() => onChange({ kind: "transparent" })}
                        className={cn(
                            "bg-checkerboard focus-visible:ring-ring grid aspect-square w-full place-items-center rounded-lg ring-1 transition-[box-shadow] duration-150 ring-inset focus-visible:ring-2 focus-visible:outline-none",
                            "[--checker-size:8px]",
                            value.kind === "transparent"
                                ? "ring-primary ring-2"
                                : "ring-border/70 hover:ring-border",
                            disabled && "cursor-not-allowed opacity-45",
                        )}
                    >
                        <IconBan
                            className="text-foreground/70 size-4"
                            stroke={1.8}
                            aria-hidden="true"
                        />
                    </button>
                </li>

                {SWATCHES.map((swatch) => {
                    const selected = selectedColor === swatch.color;

                    return (
                        <li key={swatch.name}>
                            <button
                                type="button"
                                disabled={disabled}
                                aria-pressed={selected}
                                aria-label={t(`swatches.${swatch.name}`)}
                                onClick={() => {
                                    setDraft(swatch.color);
                                    onChange({ kind: "color", color: swatch.color });
                                }}
                                // The one place a raw colour belongs in markup:
                                // this *is* the reader's output pixel, not a
                                // themed surface. See `domain/palette.ts`.
                                style={{ backgroundColor: swatch.color }}
                                className={cn(
                                    "focus-visible:ring-ring grid aspect-square w-full place-items-center rounded-lg transition-[box-shadow] duration-150 focus-visible:ring-2 focus-visible:outline-none",
                                    selected && "ring-primary ring-2 ring-offset-1",
                                    needsSwatchOutline(swatch.color) &&
                                        !selected &&
                                        "ring-border ring-1 ring-inset",
                                    disabled && "cursor-not-allowed opacity-45",
                                )}
                            >
                                {selected && (
                                    <IconCheck
                                        // Mixed against the swatch rather than a
                                        // token, so the tick stays legible on both
                                        // a white and a near-black tile.
                                        className="size-4 mix-blend-difference"
                                        stroke={3}
                                        aria-hidden="true"
                                    />
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>

            <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={customId} className="text-muted-foreground text-xs leading-[1.3]">
                    {t("color.customLabel")}
                </label>

                <div className="flex min-w-0 items-center gap-2">
                    <input
                        id={nativeId}
                        type="color"
                        value={nativeValue}
                        disabled={disabled}
                        aria-label={t("color.wheelLabel")}
                        onChange={(event) => commit(event.target.value)}
                        className="border-border size-9 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-45"
                    />

                    <Input
                        id={customId}
                        value={draft}
                        // A short identity field: seven characters is the whole
                        // grammar, so one over is a mistake worth refusing rather
                        // than metering. See `docs/patterns/input-limits.md`.
                        maxLength={7}
                        spellCheck={false}
                        autoComplete="off"
                        disabled={disabled}
                        placeholder={DEFAULT_BACKGROUND_COLOR}
                        aria-invalid={draft.length > 0 && parseHexColor(draft) === null}
                        onChange={(event) => commit(event.target.value)}
                        className="h-9 w-32 min-w-0 font-mono text-[0.8125rem]"
                    />
                </div>
            </div>
        </div>
    );
}
