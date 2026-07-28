import { TIME_ZONES } from "./time-zone-list";

export { TIME_ZONES };

/** `UTC` has no region prefix, so it gets a bucket of its own at the top. */
export const UTC_REGION = "UTC";

const ZONE_SET = new Set(TIME_ZONES);

export function isKnownTimeZone(id: string): boolean {
    return ZONE_SET.has(id);
}

/** `Asia/Dhaka` → `Asia`; `UTC` → `UTC`. */
export function getTimeZoneRegion(id: string): string {
    const separator = id.indexOf("/");

    return separator === -1 ? UTC_REGION : id.slice(0, separator);
}

/**
 * The part a person actually picks from: `Asia/Dhaka` → `Dhaka`, and
 * `America/Argentina/Buenos_Aires` → `Argentina / Buenos Aires`. Underscores
 * are IANA syntax, not something to show anyone.
 */
export function getTimeZoneCity(id: string): string {
    const separator = id.indexOf("/");

    if (separator === -1) {
        return id;
    }

    return id
        .slice(separator + 1)
        .replaceAll("_", " ")
        .replaceAll("/", " / ");
}

const REGIONS: readonly string[] = [
    UTC_REGION,
    ...[...new Set(TIME_ZONES.map(getTimeZoneRegion))]
        .filter((region) => region !== UTC_REGION)
        .toSorted((a, b) => a.localeCompare(b, "en")),
];

export function getTimeZoneRegions(): readonly string[] {
    return REGIONS;
}

const BY_REGION = new Map<string, readonly string[]>(
    REGIONS.map((region) => [
        region,
        TIME_ZONES.filter((zone) => getTimeZoneRegion(zone) === region).toSorted((a, b) =>
            getTimeZoneCity(a).localeCompare(getTimeZoneCity(b), "en"),
        ),
    ]),
);

export function getTimeZonesInRegion(region: string): readonly string[] {
    return BY_REGION.get(region) ?? [];
}

/**
 * The runtime's own zone. Browser-only — on the server `Intl` resolves to
 * whatever the host is set to, which is not the reader's zone, so callers
 * gate this behind hydration and fall back to UTC until then.
 */
export function resolveLocalTimeZone(): string {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return isKnownTimeZone(resolved) ? resolved : "UTC";
}
