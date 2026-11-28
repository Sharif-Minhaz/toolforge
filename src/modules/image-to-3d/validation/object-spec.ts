import { z } from "zod";

import {
    MAX_EXTENT_CM,
    MAX_NAME_LENGTH,
    MAX_PARTS,
    MAX_PROFILE_POINTS,
    MIN_PART_CM,
} from "../domain/constants";
import {
    PART_AXES,
    PART_SHAPES,
    type ObjectPart,
    type ObjectSpec,
    type PartShape,
    type Vector3,
} from "../types";

/**
 * Reads the model's answer into an `ObjectSpec` the builder can trust.
 *
 * Strict JSON-schema decoding means the *shape* almost always arrives intact,
 * so this is mostly about the *numbers*: a negative size, a profile of one
 * point, a part fifty metres from the rest. Every one of those still decodes as
 * valid JSON.
 *
 * Tolerant per part, strict per document. One bad part is dropped and the
 * object still builds — a hydrant missing a bolt is still a hydrant — but an
 * answer that is not JSON at all, or has no `parts` array, is `null` and the
 * reader is told the answer was unreadable rather than shown half a guess.
 */

const finite = z.number().finite();

const vector3Schema = z.tuple([finite, finite, finite]);

const rawPartSchema = z.object({
    name: z.string(),
    shape: z.enum(PART_SHAPES),
    axis: z.enum(PART_AXES).catch("y"),
    size: vector3Schema,
    position: vector3Schema,
    tilt: vector3Schema.catch([0, 0, 0]),
    taper: finite.catch(1),
    profile: z.array(z.tuple([finite, finite])).catch([]),
    color: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .catch("#9ca3af"),
    hollow: z.boolean().catch(false),
    inner_color: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .nullish()
        .catch(null),
    mirror: z.boolean().catch(false),
});

const rawSpecSchema = z.object({
    name: z.string().catch(""),
    height_cm: finite.catch(0),
    parts: z.array(z.unknown()),
});

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): Vector3 {
    const value = Number.parseInt(hex.slice(1), 16);

    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** One line, no control characters, bounded — it is shown on the page and written into files. */
export function cleanName(raw: string, fallback: string): string {
    const cleaned = raw
        .replace(/[\p{Cc}\p{Cf}]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_NAME_LENGTH)
        .trim();

    return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Cuts a profile off where it first returns to the axis.
 *
 * Asked for one side of an outline, the model often traces the whole
 * silhouette — up one side, across the top at radius zero, and back down the
 * other — which revolves into the same solid twice, inside itself. Live runs
 * did it on every lathe of a teapot. The first return to the axis is where the
 * one side it meant ends, so everything after it is the mirror image and is
 * dropped. A profile that *starts* on the axis (a pointed base) is left alone.
 */
function endAtAxis(points: readonly (readonly [number, number])[]) {
    const firstOff = points.findIndex(([radius]) => radius > 0);

    if (firstOff === -1) {
        return points;
    }

    const back = points.findIndex(([radius], index) => index > firstOff && radius === 0);

    return back === -1 ? points : points.slice(0, back + 1);
}

/**
 * A lathe profile the builder can revolve: radii not negative, at least two
 * points, and some width somewhere — a profile of all zeros is a line, and a
 * line has no volume to print.
 */
function cleanProfile(
    profile: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] | null {
    const points = endAtAxis(
        profile
            .slice(0, MAX_PROFILE_POINTS)
            .map(([radius, height]) => [Math.max(0, radius), height] as const),
    );

    if (points.length < 2 || points.every(([radius]) => radius === 0)) {
        return null;
    }

    const heights = points.map(([, height]) => height);

    // A profile written top-down revolves into the same solid upside down, so
    // it is turned the right way round rather than refused.
    return heights[0] > heights[heights.length - 1] ? points.toReversed() : points;
}

function readPart(raw: unknown, index: number): ObjectPart | null {
    const parsed = rawPartSchema.safeParse(raw);

    if (!parsed.success) {
        return null;
    }

    const part = parsed.data;
    const size = part.size.map((value) =>
        clamp(Math.abs(value), MIN_PART_CM, MAX_EXTENT_CM),
    ) as unknown as Vector3;
    const position = part.position.map((value) =>
        clamp(value, -MAX_EXTENT_CM, MAX_EXTENT_CM),
    ) as unknown as Vector3;
    // Degrees, folded into one turn: a model that writes 450 means 90.
    const tilt = part.tilt.map((value) => ((value % 360) + 360) % 360) as unknown as Vector3;

    let shape = part.shape;
    let profile: readonly (readonly [number, number])[] = [];

    if (shape === "lathe") {
        const cleaned = cleanProfile(part.profile);

        // A lathe with no usable profile still has a box, and the box is what
        // the model was surest of. A cylinder fills it.
        if (cleaned === null) {
            shape = "cylinder";
        } else {
            profile = cleaned;
        }
    }

    const color = hexToRgb(part.color);

    return {
        name: cleanName(part.name, `part ${index + 1}`),
        shape,
        axis: part.axis,
        size,
        position,
        tilt,
        taper: clamp(part.taper, 0, 1),
        color,
        // Both the profile and the flag: hollowing may shed a closing point.
        ...hollowed(part.hollow, shape, profile),
        innerColor: part.inner_color ? hexToRgb(part.inner_color) : color,
        mirror: part.mirror,
    };
}

/**
 * Whether a part is hollow, and the profile it is hollow with.
 *
 * Told to end a closed top at radius zero, the model ends *every* lathe there
 * — a mug it has just marked hollow included, with a final point that runs
 * flat across the mouth. Live, all three mugs did it. On a hollow part that
 * point is a lid it did not mean, so trailing points on the axis at the top
 * are shed before asking whether the mouth is open.
 */
function hollowed(
    asked: boolean,
    shape: PartShape,
    profile: readonly (readonly [number, number])[],
): { hollow: boolean; profile: readonly (readonly [number, number])[] } {
    if (!asked || shape !== "lathe") {
        return { hollow: asked && canHollow(shape, profile), profile };
    }

    const opened = [...profile];

    while (
        opened.length > 2 &&
        opened[opened.length - 1][0] === 0 &&
        opened[opened.length - 1][1] >= opened[opened.length - 2][1]
    ) {
        opened.pop();
    }

    return canHollow(shape, opened)
        ? { hollow: true, profile: opened }
        : { hollow: false, profile };
}

/**
 * Only something with an open mouth can be hollow. A cylinder always has one;
 * a lathe has one when its top is at least a third as wide as its widest point
 * — a bottle that narrows to a cap is a solid, not a vase with no opening.
 */
function canHollow(shape: PartShape, profile: readonly (readonly [number, number])[]): boolean {
    if (shape === "cylinder") {
        return true;
    }

    if (shape !== "lathe" || profile.length === 0) {
        return false;
    }

    const widest = Math.max(...profile.map(([radius]) => radius));

    return profile[profile.length - 1][0] >= widest / 3;
}

/** A part the model added to show a vessel's inside, which a hollow part now builds. */
const INSIDE_NAME = /\b(interior|inside|inner|cavity|opening|hollow)\b/i;

/** A solid disc the model laid over a vessel's mouth, which closes it. */
const RIM_NAME = /\b(rim|lip|mouth|top)\b/i;

function inFootprint(part: ObjectPart, vessel: ObjectPart): boolean {
    return (
        Math.abs(part.position[0] - vessel.position[0]) <= vessel.size[0] / 2 &&
        Math.abs(part.position[2] - vessel.position[2]) <= vessel.size[2] / 2
    );
}

/**
 * Turns the model's ways of drawing an open vessel into one hollow part.
 *
 * Two live runs on mugs, two different mistakes, both readable as intent. One
 * modelled "mug interior" as a cream lathe sitting on a solid body — so the
 * body containing it is made hollow, takes the interior's colour as its glaze,
 * and the interior is dropped. The other laid a solid "mug rim" cylinder across
 * the mouth — on a hollow vessel that is a lid. A thin one becomes a rolled
 * ring round the mouth, which is what an enamel mug's dark rim band is; a thick
 * one is dropped. A part that is already a ring is left alone.
 *
 * Matched by name because the name is the only place the model says what a
 * part is *for*; the geometry of an interior disc and of a lid are identical.
 */
export function tidyVessels(parts: readonly ObjectPart[]): ObjectPart[] {
    const vessels = new Map<ObjectPart, ObjectPart>();
    const dropped = new Set<ObjectPart>();
    const containerOf = (part: ObjectPart) =>
        parts
            .filter(
                (candidate) =>
                    candidate !== part &&
                    candidate.axis === "y" &&
                    canHollow(candidate.shape, candidate.profile) &&
                    inFootprint(part, candidate) &&
                    candidate.size[0] >= part.size[0] * 0.9,
            )
            .toSorted((a, b) => b.size[0] * b.size[2] - a.size[0] * a.size[2])[0];

    for (const part of parts) {
        if (!INSIDE_NAME.test(part.name)) {
            continue;
        }

        const vessel = containerOf(part);

        if (vessel !== undefined) {
            const current = vessels.get(vessel) ?? vessel;

            vessels.set(vessel, {
                ...current,
                hollow: true,
                // The model's own colour for the inside wins over a default
                // that merely copied the outside.
                innerColor: sameRgb(current.innerColor, current.color)
                    ? part.color
                    : current.innerColor,
            });
            dropped.add(part);
        }
    }

    const tidied: ObjectPart[] = parts.map((part) => vessels.get(part) ?? part);

    for (const part of tidied) {
        if (!RIM_NAME.test(part.name) || part.shape === "torus") {
            continue;
        }

        const vessel = tidied.find(
            (candidate) =>
                candidate.hollow &&
                candidate !== part &&
                inFootprint(part, candidate) &&
                part.position[1] >= candidate.position[1] + candidate.size[1] * 0.2,
        );

        if (vessel === undefined) {
            continue;
        }

        const index = tidied.indexOf(part);

        // A thin band is a real rim — the dark lip of an enamel mug — and
        // keeps its colour as a rolled ring round the mouth. Anything thicker
        // is a lid the model did not mean.
        if (part.size[1] <= part.size[0] * 0.2) {
            tidied[index] = { ...part, shape: "torus", axis: "y", hollow: false, profile: [] };
        } else {
            dropped.add(parts[index]);
        }
    }

    return tidied.filter((_, index) => !dropped.has(parts[index]));
}

function sameRgb(a: Vector3, b: Vector3): boolean {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export type ParsedObjectSpec =
    | { readonly ok: true; readonly spec: ObjectSpec }
    | { readonly ok: false; readonly reason: "unreadable_response" | "no_object" };

export function parseObjectSpec(content: string): ParsedObjectSpec {
    let json: unknown;

    try {
        json = JSON.parse(content);
    } catch {
        return { ok: false, reason: "unreadable_response" };
    }

    const parsed = rawSpecSchema.safeParse(json);

    if (!parsed.success) {
        return { ok: false, reason: "unreadable_response" };
    }

    const parts = tidyVessels(
        parsed.data.parts
            .slice(0, MAX_PARTS)
            .map(readPart)
            .filter((part): part is ObjectPart => part !== null),
    );

    if (parts.length === 0) {
        return { ok: false, reason: "no_object" };
    }

    return {
        ok: true,
        spec: {
            name: cleanName(parsed.data.name.replaceAll("_", " "), "object"),
            heightCm: clamp(Math.abs(parsed.data.height_cm), 0, MAX_EXTENT_CM),
            parts,
        },
    };
}
