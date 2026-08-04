"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Chip } from "./panel-card";
import { useCountryName } from "./use-country-name";

/**
 * A country code as a flag and its code, naming itself in full on hover.
 *
 * The two-letter code stays visible rather than being replaced by the flag,
 * for the reason flags are a poor label everywhere: Windows browsers render a
 * regional-indicator pair as the plain letters, several countries have flags
 * most people cannot name, and a screen reader gets nothing useful out of the
 * glyph. The flag is the ornament; the code is the label; the tooltip is the
 * answer for anyone who wants it.
 *
 * `TooltipTrigger` renders a real `<button>`, so the name is reachable by
 * keyboard as well as by pointer — the rule hover-only affordances break.
 */
export function CountryChip({ code }: { code: string }) {
    const { flag, name } = useCountryName()(code);

    const face = (
        <>
            {flag !== null && (
                <span aria-hidden="true" className="mr-1">
                    {flag}
                </span>
            )}
            {code.toUpperCase()}
        </>
    );

    // Nothing to reveal means nothing to hover: a chip that opens a tooltip
    // repeating what it already says is worse than a plain chip.
    if (name === null) {
        return <Chip>{face}</Chip>;
    }

    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <button
                        type="button"
                        aria-label={name}
                        className="focus-visible:ring-ring cursor-help rounded-md focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <Chip>{face}</Chip>
                    </button>
                }
            />
            <TooltipContent side="top" sideOffset={6}>
                {flag === null ? name : `${flag} ${name}`}
            </TooltipContent>
        </Tooltip>
    );
}
