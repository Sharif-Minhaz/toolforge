"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { REFERENCE_SIZES } from "../domain/constants";
import { chooseReference, referenceArea, roundedCount } from "../domain/reference";
import type { PitchComparison } from "../types";
import { FootballPitch } from "./football-pitch";
import { ReferenceFigure } from "./reference-figure";

type SizeComparisonProps = {
    /** The plot in m², or `null` while the input cannot be read. */
    squareMeters: number | null;
    pitches: PitchComparison | null;
    dimmed: boolean;
};

/**
 * How big the plot is, in things a reader has stood next to. One sentence
 * says it; the drawing shows it, with the plot and the object at one scale.
 * A plot of a pitch or more is laid out on pitches, as many as it fills.
 */
export function SizeComparison({ squareMeters, pitches, dimmed }: SizeComparisonProps) {
    const t = useTranslations("landMeasurement.workbench");
    const formatter = useFormatter();

    if (squareMeters === null || squareMeters === 0) {
        return <p className="text-muted-foreground text-sm leading-[1.5]">{t("sizeEmpty")}</p>;
    }

    const { object, ratio } = chooseReference(squareMeters);
    const { length, width } = REFERENCE_SIZES[object];
    const side = Math.sqrt(squareMeters);
    const sideMeters = formatter.number(side, { maximumFractionDigits: side < 10 ? 2 : 1 });
    const sideFeet = formatter.number(side / 0.3048, { maximumFractionDigits: side < 10 ? 1 : 0 });
    const count = roundedCount(ratio);
    const sentence =
        ratio < 1
            ? t("sizeShare", {
                  percent: formatter.number(ratio, { style: "percent", maximumFractionDigits: 0 }),
                  thing: t(`objects.${object}.a`),
              })
            : t("sizeAbout", { things: t(`objects.${object}.count`, { count }) });

    return (
        <figure
            className={cn(
                "m-0 flex flex-col gap-3 transition-opacity duration-200",
                dimmed && "opacity-55",
            )}
        >
            <figcaption className="text-[0.9375rem] leading-[1.5] font-medium">
                {sentence}
            </figcaption>

            <div role="img" aria-label={sentence}>
                {object === "football-pitch" && pitches !== null ? (
                    <div
                        className={cn(
                            "grid gap-2",
                            pitches.drawnPitches === 1 && "mx-auto max-w-3xl grid-cols-1",
                            pitches.drawnPitches > 1 && pitches.drawnPitches <= 4 && "grid-cols-2",
                            pitches.drawnPitches > 4 &&
                                pitches.drawnPitches <= 9 &&
                                "grid-cols-2 sm:grid-cols-3",
                            pitches.drawnPitches > 9 && "grid-cols-3 sm:grid-cols-5 lg:grid-cols-6",
                        )}
                    >
                        {Array.from({ length: pitches.drawnPitches }, (_, index) => (
                            <FootballPitch
                                key={index}
                                plot={index < pitches.fullPitches ? "full" : pitches.remainder}
                            />
                        ))}
                    </div>
                ) : object !== "football-pitch" ? (
                    <ReferenceFigure
                        squareMeters={squareMeters}
                        object={object}
                        // Under one the sentence is a percentage, so the share is exact;
                        // above it the drawing shows the rounded count the sentence says.
                        count={ratio < 1 ? ratio : count}
                        sideLabel={t("sideMeters", { meters: sideMeters })}
                    />
                ) : null}
            </div>

            {pitches?.truncated === true && object === "football-pitch" && (
                <p className="text-muted-foreground text-xs leading-[1.4]">
                    {t("pitchTruncated", {
                        drawn: formatter.number(pitches.drawnPitches),
                        total: formatter.number(Math.ceil(pitches.ratio)),
                    })}
                </p>
            )}

            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs leading-[1.4]">
                <span className="inline-flex items-center gap-1.5">
                    <span
                        aria-hidden="true"
                        className="bg-primary/40 ring-primary size-3 rounded-[3px] ring-1 ring-inset"
                    />
                    {object === "football-pitch"
                        ? t("legendLand")
                        : t("legendLandSquare", { meters: sideMeters, feet: sideFeet })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span
                        aria-hidden="true"
                        className={cn(
                            "size-3 rounded-[3px] ring-1 ring-inset",
                            object === "single-bed"
                                ? "bg-chart-1/35 ring-chart-1/70"
                                : object === "parking-space"
                                  ? "bg-chart-2/80 ring-chart-2"
                                  : object === "tennis-court"
                                    ? "bg-chart-2/20 ring-foreground/60"
                                    : "bg-success/20 ring-success/80",
                        )}
                    />
                    {t("objectSize", {
                        name: t(`objects.${object}.name`),
                        length: formatter.number(length),
                        width: formatter.number(width),
                        area: formatter.number(referenceArea(object), { maximumFractionDigits: 1 }),
                    })}
                </span>
            </div>
        </figure>
    );
}
