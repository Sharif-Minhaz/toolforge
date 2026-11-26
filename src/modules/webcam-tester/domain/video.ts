import { deviceConstraint } from "@/modules/tools/domain/media-devices";
import type { PixelSize } from "@/modules/tools/types";
import {
    LIST_CAPABILITIES,
    RANGE_CAPABILITIES,
    type CapabilityRow,
    type DeliveryVerdict,
    type ResolutionPreset,
} from "../types";

export const DEFAULT_RESOLUTION_PRESET: ResolutionPreset = "max";

export const DEFAULT_MIRROR = true;

/** Proper names and sizes — data, not copy. */
export const PRESET_SIZES: Readonly<
    Record<Exclude<ResolutionPreset, "max">, { readonly name: string; readonly size: PixelSize }>
> = {
    uhd: { name: "4K UHD", size: { width: 3840, height: 2160 } },
    qhd: { name: "QHD", size: { width: 2560, height: 1440 } },
    "full-hd": { name: "Full HD", size: { width: 1920, height: 1080 } },
    hd: { name: "HD", size: { width: 1280, height: 720 } },
    vga: { name: "VGA", size: { width: 640, height: 480 } },
};

/** 8K: past any webcam, so the nearest mode the camera has is its largest. */
const MAX_REQUEST: PixelSize = { width: 7680, height: 4320 };

export function requestedSize(preset: ResolutionPreset): PixelSize {
    return preset === "max" ? MAX_REQUEST : PRESET_SIZES[preset].size;
}

/**
 * The video half of a capture request. Sizes are `ideal`, never `exact`: a
 * camera without the asked-for mode still opens, and the report says what it
 * sent instead of the page showing an error.
 */
export function buildVideoConstraints(
    preset: ResolutionPreset,
    deviceId: string | null,
): MediaTrackConstraints {
    const size = requestedSize(preset);

    return {
        ...deviceConstraint(deviceId),
        width: { ideal: size.width },
        height: { ideal: size.height },
    };
}

export type AspectRatio = {
    readonly label: string;
    readonly value: number;
    /** The label is the nearest common ratio, not the exact one. */
    readonly approximate: boolean;
};

/** Landscape; a portrait frame is matched against each one turned on its side. */
const COMMON_RATIOS: readonly (readonly [number, number])[] = [
    [1, 1],
    [5, 4],
    [4, 3],
    [3, 2],
    [16, 10],
    [16, 9],
    [21, 9],
];

/** Past this, a reduced ratio (683:384) says less than the nearest common one. */
const MAX_REDUCED_TERM = 32;

/** "21:9" monitors and cameras are 64:27 or 43:18 — within this of 21:9. */
const NEAR_RATIO_TOLERANCE = 0.03;

function greatestCommonDivisor(a: number, b: number): number {
    return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function isPositiveInteger(value: number): boolean {
    return Number.isInteger(value) && value > 0;
}

/**
 * The frame's shape as people name it. Common ratios win over the reduced
 * fraction, so 1920 × 1200 reads 16:10 rather than 8:5.
 */
export function describeAspect({ width, height }: PixelSize): AspectRatio | null {
    if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
        return null;
    }

    const value = width / height;
    const oriented = COMMON_RATIOS.map(([a, b]) => (height > width ? [b, a] : [a, b]));
    const exact = oriented.find(([a, b]) => width * b === height * a);

    if (exact !== undefined) {
        return { label: `${exact[0]}:${exact[1]}`, value, approximate: false };
    }

    const divisor = greatestCommonDivisor(width, height);
    const reduced = [width / divisor, height / divisor];

    if (reduced[0] <= MAX_REDUCED_TERM && reduced[1] <= MAX_REDUCED_TERM) {
        return { label: `${reduced[0]}:${reduced[1]}`, value, approximate: false };
    }

    const distance = ([a, b]: readonly number[]) => Math.abs(value - a / b) / (a / b);
    const nearest = oriented.reduce((best, ratio) =>
        distance(ratio) < distance(best) ? ratio : best,
    );

    return distance(nearest) <= NEAR_RATIO_TOLERANCE
        ? { label: `${nearest[0]}:${nearest[1]}`, value, approximate: true }
        : { label: `${value.toFixed(2)}:1`, value, approximate: true };
}

/** The part of `MediaTrackSettings` the report reads. */
export type VideoSettingsLike = {
    readonly width?: number;
    readonly height?: number;
    readonly frameRate?: number;
};

export type VideoReading = {
    readonly size: PixelSize | null;
    readonly frameRate: number | null;
    readonly aspect: AspectRatio | null;
};

function isPositive(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value > 0;
}

/** What the track says it is delivering. A field a browser leaves out stays `null`. */
export function readVideoSettings(settings: VideoSettingsLike): VideoReading {
    const size =
        isPositive(settings.width) && isPositive(settings.height)
            ? { width: settings.width, height: settings.height }
            : null;

    return {
        size,
        frameRate: isPositive(settings.frameRate) ? settings.frameRate : null,
        aspect: size === null ? null : describeAspect(size),
    };
}

export function judgeDelivery(preset: ResolutionPreset, delivered: PixelSize): DeliveryVerdict {
    if (preset === "max") {
        return "largest";
    }

    const asked = PRESET_SIZES[preset].size;
    // A phone held upright sends the asked-for size turned on its side.
    const matched =
        (asked.width === delivered.width && asked.height === delivered.height) ||
        (asked.width === delivered.height && asked.height === delivered.width);

    if (matched) {
        return "matched";
    }

    return delivered.width * delivered.height < asked.width * asked.height
        ? "smaller"
        : "different";
}

function isRange(value: unknown): value is { readonly min: number; readonly max: number } {
    return (
        typeof value === "object" &&
        value !== null &&
        "min" in value &&
        "max" in value &&
        typeof value.min === "number" &&
        typeof value.max === "number" &&
        Number.isFinite(value.min) &&
        Number.isFinite(value.max) &&
        value.min <= value.max
    );
}

function isStringList(value: unknown): value is readonly string[] {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((entry) => typeof entry === "string")
    );
}

/**
 * The ranges `getCapabilities()` reports, in a fixed order. `aspectRatio` is
 * left out on purpose: under Chrome's crop-and-scale it spans 1 / height to
 * width / 1, which describes the scaler rather than the camera.
 */
export function readCapabilities(capabilities: object): readonly CapabilityRow[] {
    const ranges = RANGE_CAPABILITIES.flatMap((key): CapabilityRow[] => {
        const value: unknown = Reflect.get(capabilities, key);

        return isRange(value) ? [{ kind: "range", key, min: value.min, max: value.max }] : [];
    });
    const lists = LIST_CAPABILITIES.flatMap((key): CapabilityRow[] => {
        const value: unknown = Reflect.get(capabilities, key);

        return isStringList(value) ? [{ kind: "list", key, values: value }] : [];
    });

    return [...ranges, ...lists];
}
