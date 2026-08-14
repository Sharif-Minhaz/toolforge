"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { cn } from "@/lib/utils";
import { CodeBlock } from "@/modules/tools/components/code-block";

import type { EquationReading } from "../types";
import { LatexPreview } from "./latex-preview";

type ReadingPickerProps = {
    readings: readonly EquationReading[];
    /** The LaTeX currently in the editor, which is what marks a row as chosen. */
    selected: string;
    display: boolean;
    onSelect: (reading: EquationReading) => void;
};

/**
 * The other ways this line can be read, side by side with what each one renders.
 *
 * The tool has always said when it guessed. This is what it does about it: `H2O`
 * is `H^2O` to algebra and `H_2O` to chemistry, and rather than pick one and
 * report the doubt, every defensible reading is shown with its preview so the
 * answer is chosen by looking rather than by rewriting.
 *
 * A radio group rather than a row of buttons, because that is what it is —
 * exactly one reading is in the editor at a time, and arrow keys should move
 * between them. The rendered preview sits beside the list rather than under each
 * row: four KaTeX renders stacked would be four times the height on a phone, and
 * the point of the comparison is that one thing changes at a time.
 */
export function ReadingPicker({ readings, selected, display, onSelect }: ReadingPickerProps) {
    const t = useTranslations("equation.readings");
    const labelId = useId();

    // The editor is the source of truth: a hand-edit that no longer matches any
    // reading leaves every row unchecked, which is the honest thing to show.
    const active = readings.find((reading) => reading.latex === selected) ?? null;

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <p id={labelId} className="text-muted-foreground text-xs leading-[1.3]">
                {t("label")}
            </p>

            <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div
                    role="radiogroup"
                    aria-labelledby={labelId}
                    className="flex min-w-0 flex-col gap-1.5"
                >
                    {readings.map((reading) => {
                        const chosen = reading === active;

                        return (
                            <button
                                key={reading.kind}
                                type="button"
                                role="radio"
                                aria-checked={chosen}
                                onClick={() => onSelect(reading)}
                                className={cn(
                                    "group flex min-w-0 flex-col items-start gap-1 rounded-xl px-3 py-2 text-left",
                                    "ring-1 transition-colors duration-200 outline-none ring-inset",
                                    "focus-visible:ring-ring focus-visible:ring-2",
                                    chosen
                                        ? "bg-card ring-primary/70"
                                        : "bg-muted/40 ring-border/60 hover:bg-muted/70",
                                )}
                            >
                                <span
                                    className={cn(
                                        "text-[0.6875rem] leading-[1.3] font-medium",
                                        chosen ? "text-primary" : "text-muted-foreground",
                                    )}
                                >
                                    {t(reading.kind)}
                                </span>
                                <CodeBlock
                                    code={reading.latex}
                                    language="latex"
                                    className="w-full min-w-0"
                                />
                            </button>
                        );
                    })}
                </div>

                <div className="ring-border/60 bg-card/40 flex min-w-0 items-center justify-center rounded-xl px-3 py-4 ring-1 ring-inset">
                    <LatexPreview
                        latex={active?.latex ?? selected}
                        display={display}
                        // Never pending: a reading is chosen by a press, so
                        // there is no debounce for this preview to lag behind.
                        pending={false}
                        labelledBy={labelId}
                    />
                </div>
            </div>

            {/*
             * The escape hatch, said where the guess is visible rather than in
             * the article. Reading it is how somebody learns that the input can
             * settle the question outright.
             */}
            <p className="text-muted-foreground text-[0.75rem] leading-normal">{t("hint")}</p>
        </div>
    );
}
