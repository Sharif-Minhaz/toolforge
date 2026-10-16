"use client";

import { useFormatter } from "next-intl";

/**
 * `1:05` — a duration as a player shows it, in the interface's digits, so a
 * Bangla reader sees `১:০৫` beside a Bangla sentence.
 */
export function useClock(): (seconds: number) => string {
    const formatter = useFormatter();

    return (seconds) => {
        const whole = Math.max(0, Math.round(seconds));
        const minutes = Math.floor(whole / 60);

        return `${formatter.number(minutes)}:${formatter.number(whole % 60, { minimumIntegerDigits: 2 })}`;
    };
}
