"use client";

import { IconPlus } from "@tabler/icons-react";
import { useMemo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { getTimeZoneCity, getTimeZoneRegions, getTimeZonesInRegion } from "../domain/time-zones";

function toItems(values: readonly string[], label: (value: string) => string) {
    return Object.fromEntries(values.map((value) => [value, label(value)])) as Record<
        string,
        ReactNode
    >;
}

type ZonePickerProps = {
    region: string;
    timeZone: string;
    /**
     * Every label arrives as a prop, so the same control can sit under the
     * input and under the comparison board without either inheriting the
     * other's copy — or, worse, both announcing "Region" to a screen reader.
     */
    regionLabel: string;
    cityLabel: string;
    /** Omit to drive a value directly instead of adding to a list. */
    addLabel?: string;
    onAdd?: () => void;
    addDisabled?: boolean;
    addHint?: ReactNode;
    onRegionChange: (region: string) => void;
    onTimeZoneChange: (timeZone: string) => void;
};

/**
 * Region first, then city. The database holds over four hundred zones, which is
 * far too many for one list — and splitting on the id's own prefix means both
 * lists come from the frozen snapshot rather than from anything the runtime
 * decides, so the server and the browser render the same options.
 */
export function ZonePicker({
    region,
    timeZone,
    regionLabel,
    cityLabel,
    addLabel,
    onAdd,
    addDisabled = false,
    addHint,
    onRegionChange,
    onTimeZoneChange,
}: ZonePickerProps) {
    const regions = getTimeZoneRegions();
    const regionItems = useMemo(() => toItems(regions, (value) => value), [regions]);

    const zones = useMemo(() => getTimeZonesInRegion(region), [region]);
    const zoneItems = useMemo(() => toItems(zones, getTimeZoneCity), [zones]);

    function handleRegionChange(next: string) {
        onRegionChange(next);

        // The old city is not in the new region, so the trigger would otherwise
        // show a value its own list no longer offers.
        const first = getTimeZonesInRegion(next)[0];

        if (first !== undefined) {
            onTimeZoneChange(first);
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <OptionSelect
                    label={regionLabel}
                    value={region}
                    items={regionItems}
                    values={regions}
                    onChange={handleRegionChange}
                />
                <OptionSelect
                    label={cityLabel}
                    value={timeZone}
                    items={zoneItems}
                    values={zones}
                    onChange={onTimeZoneChange}
                />
            </div>

            {onAdd !== undefined && addLabel !== undefined && (
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onAdd} disabled={addDisabled}>
                        <IconPlus className="size-3.5" stroke={2} aria-hidden="true" />
                        {addLabel}
                    </Button>
                    {addHint !== undefined && (
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                            {addHint}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
