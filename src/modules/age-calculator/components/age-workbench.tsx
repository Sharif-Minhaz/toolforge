"use client";

import { IconCake, IconCalendarRepeat } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { OptionsDisclosure } from "@/modules/tools/components/workbench-step";
import { MAX_HIJRI_ADJUSTMENT } from "../domain/constants";
import {
    AGE_MODES,
    type AgeFields,
    type AgeMode,
    type CivilDate,
    type ConvertFields,
} from "../types";

const MODE_ICONS = { age: IconCake, convert: IconCalendarRepeat } as const;
import { AgePanel } from "./age-panel";
import { ConvertPanel } from "./convert-panel";
import { SegmentedControl } from "./segmented-control";
import { useCalendarLabels } from "./use-calendar-labels";

const ADJUSTMENTS: readonly number[] = Array.from(
    { length: MAX_HIJRI_ADJUSTMENT * 2 + 1 },
    (_, index) => index - MAX_HIJRI_ADJUSTMENT,
);

type AgeWorkbenchProps = {
    /** Today in Bangladesh, read once on the server so both renders agree. */
    today: CivilDate;
    initialMode: AgeMode;
    initialAgeFields: AgeFields;
    initialConvertFields: ConvertFields;
    initialHijriAdjustment: number;
};

/**
 * Two panels behind one switch. Both stay mounted and the inactive one is
 * hidden, so a reader who flips to Convert to check a Bangla date comes back
 * to the dates they had typed.
 */
export function AgeWorkbench({
    today,
    initialMode,
    initialAgeFields,
    initialConvertFields,
    initialHijriAdjustment,
}: AgeWorkbenchProps) {
    const t = useTranslations("ageCalculator.workbench");
    const labels = useCalendarLabels();
    const modeLabelId = useId();
    const adjustmentLabelId = useId();
    const adjustmentHintId = useId();

    const [mode, setMode] = useState<AgeMode>(initialMode);
    const [hijriAdjustment, setHijriAdjustment] = useState(initialHijriAdjustment);

    function signed(value: number): string {
        const magnitude = labels.digits(Math.abs(value));

        return value > 0 ? `+${magnitude}` : value < 0 ? `−${magnitude}` : magnitude;
    }

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <Label id={modeLabelId} className="text-muted-foreground text-xs">
                            {t("modeLabel")}
                        </Label>
                        <SegmentedControl
                            options={AGE_MODES.map((value) => ({
                                value,
                                label: t(`modes.${value}`),
                                Icon: MODE_ICONS[value],
                            }))}
                            value={mode}
                            labelId={modeLabelId}
                            layoutId="age-calculator-mode-indicator"
                            onChange={setMode}
                        />
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {t(`modeHints.${mode}`)}
                        </p>
                    </div>

                    <OptionsDisclosure>
                        <div className="flex flex-col gap-1.5">
                            <span
                                id={adjustmentLabelId}
                                className="text-muted-foreground text-xs leading-[1.3] font-medium"
                            >
                                {t("hijriAdjustmentLabel")}
                            </span>
                            <div
                                role="radiogroup"
                                aria-labelledby={adjustmentLabelId}
                                aria-describedby={adjustmentHintId}
                                className="flex flex-wrap gap-1"
                            >
                                {ADJUSTMENTS.map((value) => {
                                    const selected = value === hijriAdjustment;

                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            onClick={() => setHijriAdjustment(value)}
                                            className={cn(
                                                "h-8 min-w-10 rounded-lg px-2 font-mono text-xs tabular-nums transition-colors duration-200",
                                                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                                selected
                                                    ? "bg-primary/10 text-primary ring-primary/25 ring-1 ring-inset"
                                                    : "text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground ring-1 ring-inset",
                                            )}
                                        >
                                            {signed(value)}
                                        </button>
                                    );
                                })}
                            </div>
                            <p
                                id={adjustmentHintId}
                                className="text-muted-foreground text-[0.6875rem] leading-[1.4]"
                            >
                                {t("hijriAdjustmentHint")}
                            </p>
                        </div>
                    </OptionsDisclosure>
                </div>

                <div hidden={mode !== "age"}>
                    <AgePanel
                        today={today}
                        initialFields={initialAgeFields}
                        hijriAdjustment={hijriAdjustment}
                    />
                </div>
                <div hidden={mode !== "convert"}>
                    <ConvertPanel
                        today={today}
                        initialFields={initialConvertFields}
                        hijriAdjustment={hijriAdjustment}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
