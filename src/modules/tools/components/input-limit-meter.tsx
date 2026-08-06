"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { readInputLimit, type InputLimitReading } from "../domain/input-limit";
import type { StatusTone } from "./status-strip";

/**
 * The visible half of every length ceiling on the site.
 *
 * Three states, and the reason there are three rather than two is the whole
 * point: a box that only complains once it is full teaches nobody anything, and
 * a box that shows `0 / 60` from the first keystroke is noise on fifty-nine of
 * them. Plenty of room says nothing (unless the caller asks for a running
 * count), the last stretch counts down, and past the ceiling it says how far.
 *
 * The counter sits in the label row and the failure sits under the box, fed
 * into whichever `StatusStrip` the tool already had. That split is deliberate:
 * "how much is left" is a property of the field and belongs beside its name,
 * while "this cannot be submitted" is a verdict and belongs where every other
 * verdict on the page appears.
 */

/** Re-read on every render — it is two comparisons, not a computation. */
export function useInputLimit(length: number, limit: number): InputLimitReading {
    return useMemo(() => readInputLimit(length, limit), [length, limit]);
}

type InputLimitMeterProps = {
    reading: InputLimitReading;
    /**
     * Formats both counts. Byte-measured fields pass `useByteLabel()`; the
     * default renders a locale-grouped number, so Bangla gets Bengali digits.
     *
     * Passing one also switches the copy off its plural forms — "1 character
     * left" has no sensible byte equivalent.
     */
    format?: (value: number) => string;
    /** Show the running count even while there is plenty of room. */
    always?: boolean;
    id?: string;
    className?: string;
};

export function InputLimitMeter({
    reading,
    format,
    always = false,
    id,
    className,
}: InputLimitMeterProps) {
    const t = useTranslations("common.inputLimit");
    const formatter = useFormatter();
    const formatValue = format ?? ((value: number) => formatter.number(value));
    const sized = format !== undefined;

    if (reading.state === "ok" && !always) {
        return null;
    }

    const message = (() => {
        if (reading.state === "over") {
            return sized
                ? t("sizeOver", { value: formatValue(reading.over) })
                : t("over", { count: reading.over });
        }

        if (reading.state === "near") {
            if (reading.remaining === 0) {
                return t("reached");
            }

            return sized
                ? t("sizeRemaining", { value: formatValue(reading.remaining) })
                : t("remaining", { count: reading.remaining });
        }

        return t("count", {
            length: formatValue(reading.length),
            limit: formatValue(reading.limit),
        });
    })();

    return (
        <span
            id={id}
            // Silent while there is room: a live region that re-announces on
            // every keystroke is unusable. It only speaks once the count starts
            // mattering, which is exactly when a reader needs to hear it.
            role={reading.state === "ok" ? undefined : "status"}
            className={cn(
                "font-mono text-[0.6875rem] tabular-nums",
                reading.state === "over" && "text-destructive",
                reading.state === "near" && "text-brand-amber",
                reading.state === "ok" && "text-muted-foreground",
                className,
            )}
        >
            {message}
        </span>
    );
}

export type InputLimitStatus = {
    readonly tone: StatusTone;
    readonly message: string;
};

/**
 * The under-the-box line for a field that is past its ceiling, shaped for the
 * `StatusStrip` every workbench already renders. `null` while the value fits,
 * so a caller can fall back to whatever it was showing before.
 */
export function useInputLimitStatus(
    reading: InputLimitReading,
    format?: (value: number) => string,
): InputLimitStatus | null {
    const t = useTranslations("common.inputLimit");
    const formatter = useFormatter();

    if (reading.state !== "over") {
        return null;
    }

    const amount =
        format === undefined
            ? t("over", { count: reading.over })
            : t("sizeOver", { value: format(reading.over) });

    return {
        tone: "error",
        message: t("overHint", {
            amount,
            limit: format === undefined ? formatter.number(reading.limit) : format(reading.limit),
        }),
    };
}
