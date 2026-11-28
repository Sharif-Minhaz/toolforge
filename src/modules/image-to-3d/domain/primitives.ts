import type { MeshDetail, PartShape } from "../types";
import { ARC_SEGMENTS, RADIAL_SEGMENTS } from "./constants";

/**
 * Each primitive as closed surfaces in its own frame: centred on the origin,
 * its long axis along +y, filling the box `±hx, ±hy, ±hz`.
 *
 * A shape comes back as several **patches** rather than one buffer, and a
 * patch is the unit normals are smoothed within. A cylinder's wall and its
 * caps are separate patches, so the rim is a crisp edge rather than a blurred
 * one; a sphere is one patch, so it shades round. The patches of one part share
 * positions along their borders but not indices — the part is closed by
 * *position*, which is what every watertightness check here keys on.
 *
 * Triangles are counter-clockwise seen from outside. `signedVolume` in the
 * tests is what proves it, shape by shape.
 */

export type Patch = {
    /** `vertexCount * 3`, in the part's own frame. */
    readonly positions: number[];
    readonly indices: number[];
    /**
     * True for the inside of a hollow vessel — the walls and floor a reader
     * sees looking into a cup — which the assembler can give its own colour.
     */
    readonly inner?: boolean;
};

export type HalfExtents = {
    readonly hx: number;
    readonly hy: number;
    readonly hz: number;
};

/** `[radius as a share of the cross half-extent, height in the part's own units]`. */
export type ProfilePoint = readonly [number, number];

/**
 * How sharply a lathe profile may turn and still be shaded as one smooth
 * surface. Past this it is a corner — the rim of a cup, a hydrant's flange —
 * and the profile is split there so the two sides keep their own normals.
 */
const CREASE_RADIANS = (50 * Math.PI) / 180;

function emptyPatch(): Patch {
    return { positions: [], indices: [] };
}

function pushVertex(patch: Patch, x: number, y: number, z: number): number {
    patch.positions.push(x, y, z);

    return patch.positions.length / 3 - 1;
}

/** Consecutive points at the same place make zero-area triangles; one is enough. */
function dropRepeats(points: readonly ProfilePoint[]): ProfilePoint[] {
    return points.filter(
        (point, index) =>
            index === 0 ||
            Math.abs(point[0] - points[index - 1][0]) > 1e-9 ||
            Math.abs(point[1] - points[index - 1][1]) > 1e-9,
    );
}

/**
 * Splits an open profile into runs that each shade smoothly. A crease point
 * ends one run and starts the next, so both sides of the corner have a ring
 * there.
 */
function splitAtCreases(points: readonly ProfilePoint[], extents: HalfExtents): ProfilePoint[][] {
    const runs: ProfilePoint[][] = [];
    let current: ProfilePoint[] = [points[0]];
    // Compared in real units, so a flange that is sharp on a squat part is not
    // smoothed away by the profile having been normalised.
    const radial = (extents.hx + extents.hz) / 2;

    for (let index = 1; index < points.length; index += 1) {
        current.push(points[index]);

        const next = points[index + 1];

        if (next === undefined) {
            break;
        }

        const point = points[index];
        const previous = points[index - 1];
        const inAngle = Math.atan2(point[1] - previous[1], (point[0] - previous[0]) * radial);
        const outAngle = Math.atan2(next[1] - point[1], (next[0] - point[0]) * radial);
        let turn = Math.abs(outAngle - inAngle);

        turn = Math.min(turn, 2 * Math.PI - turn);

        if (turn > CREASE_RADIANS) {
            runs.push(current);
            current = [point];
        }
    }

    runs.push(current);

    return runs;
}

/**
 * One ring per profile point, or a single vertex where the radius is zero.
 *
 * The ring's first vertex is reused to close it rather than duplicated, which
 * is what makes the wrap shade without a seam — there are no texture
 * coordinates here to need two.
 */
function revolveRun(run: readonly ProfilePoint[], extents: HalfExtents, segments: number): Patch {
    const patch = emptyPatch();
    const rings: number[][] = run.map(([radius, height]) => {
        if (radius === 0) {
            return [pushVertex(patch, 0, height, 0)];
        }

        const ring: number[] = [];

        for (let step = 0; step < segments; step += 1) {
            const angle = (step / segments) * Math.PI * 2;

            ring.push(
                pushVertex(
                    patch,
                    radius * extents.hx * Math.sin(angle),
                    height,
                    radius * extents.hz * Math.cos(angle),
                ),
            );
        }

        return ring;
    });

    const bands = rings.length - 1;

    for (let band = 0; band < bands; band += 1) {
        const lower = rings[band];
        const upper = rings[band + 1];

        for (let step = 0; step < segments; step += 1) {
            const a = lower[lower.length === 1 ? 0 : step];
            const b = lower[lower.length === 1 ? 0 : (step + 1) % segments];
            const c = upper[upper.length === 1 ? 0 : (step + 1) % segments];
            const d = upper[upper.length === 1 ? 0 : step];

            // A pole collapses one of the two triangles of the quad to a line.
            if (lower.length > 1) {
                patch.indices.push(a, b, c);
            }

            if (upper.length > 1) {
                patch.indices.push(a, c, d);
            }
        }
    }

    return patch;
}

/** A flat disc closing a ring, facing down the axis when `facing` is -1 and up it when +1. */
function cap(
    radius: number,
    height: number,
    extents: HalfExtents,
    segments: number,
    facing: 1 | -1,
) {
    const patch = emptyPatch();
    const centre = pushVertex(patch, 0, height, 0);
    const ring: number[] = [];

    for (let step = 0; step < segments; step += 1) {
        const angle = (step / segments) * Math.PI * 2;

        ring.push(
            pushVertex(
                patch,
                radius * extents.hx * Math.sin(angle),
                height,
                radius * extents.hz * Math.cos(angle),
            ),
        );
    }

    for (let step = 0; step < segments; step += 1) {
        const current = ring[step];
        const next = ring[(step + 1) % segments];

        patch.indices.push(...(facing === 1 ? [centre, current, next] : [centre, next, current]));
    }

    return patch;
}

/**
 * A solid of revolution from an open profile, bottom to top, closed at both
 * ends — by a pole where the profile meets the axis, by a flat cap where it
 * does not.
 */
export function revolveProfile(
    profile: readonly ProfilePoint[],
    extents: HalfExtents,
    segments: number,
    caps: { readonly start: boolean; readonly end: boolean } = { start: true, end: true },
): Patch[] {
    const points = dropRepeats(profile);

    if (points.length < 2) {
        return [];
    }

    const patches = splitAtCreases(points, extents).map((run) =>
        revolveRun(run, extents, segments),
    );
    const [bottomRadius, bottomHeight] = points[0];
    const [topRadius, topHeight] = points[points.length - 1];

    if (caps.start && bottomRadius > 0) {
        patches.push(cap(bottomRadius, bottomHeight, extents, segments, -1));
    }

    if (caps.end && topRadius > 0) {
        patches.push(cap(topRadius, topHeight, extents, segments, 1));
    }

    return patches;
}

/** The profile's radius at a height, by straight lines between its points. */
export function radiusAt(points: readonly ProfilePoint[], height: number): number {
    for (let index = 1; index < points.length; index += 1) {
        const [lowRadius, low] = points[index - 1];
        const [highRadius, high] = points[index];

        if (height >= Math.min(low, high) && height <= Math.max(low, high)) {
            const span = high - low;

            return span === 0
                ? Math.max(lowRadius, highRadius)
                : lowRadius + ((height - low) / span) * (highRadius - lowRadius);
        }
    }

    return points[points.length - 1][0];
}

/**
 * An open vessel: the profile's outside, a rim, the same outline offset inward
 * by the wall, and a floor — one closed solid with a cavity open at the top.
 *
 * Built here rather than asked of the model. Asked to trace a cup's inside
 * itself, the model traced whole silhouettes and doubled every turned part;
 * asked nothing, it modelled the inside as a separate cream-coloured disc
 * sitting on a solid cylinder. "Hollow: true" is a word it gets right, and the
 * wall is arithmetic. The inside patches are flagged so the assembler can
 * paint them a glaze of their own.
 *
 * The wall is a tenth of the radius — 4 mm on an 8 cm mug — and the floor at
 * least as thick, or six percent of the height on a tall one.
 */
export function hollowShell(
    outline: readonly ProfilePoint[],
    extents: HalfExtents,
    segments: number,
): Patch[] {
    const outer = dropRepeats(outline);

    if (outer.length < 2) {
        return [];
    }

    const radius = (extents.hx + extents.hz) / 2;
    const wall = Math.min(Math.max(0.1 * radius, 0.15), 0.5 * radius) / radius;
    const bottom = outer[0][1];
    const top = outer[outer.length - 1][1];
    const floor = bottom + Math.max(wall * radius, 0.06 * (top - bottom));
    const inset = (value: number) => Math.max(value - wall, 0.02);

    const outside: ProfilePoint[] = [...outer, [inset(outer[outer.length - 1][0]), top]];
    const inside: ProfilePoint[] = [
        [inset(outer[outer.length - 1][0]), top],
        ...outer
            .filter(([, height]) => height > floor && height < top)
            .toReversed()
            .map(([value, height]) => [inset(value), height] as const),
        [inset(radiusAt(outer, floor)), floor],
        [0, floor],
    ];

    return [
        // The outside keeps its base; its top ends on the rim's inner edge,
        // where the inside begins, so the two meet by position and close.
        ...revolveProfile(outside, extents, segments, { start: true, end: false }),
        ...revolveProfile(inside, extents, segments, { start: false, end: false }).map((patch) => ({
            ...patch,
            inner: true,
        })),
    ];
}

/**
 * A lathe profile as the model wrote it, stretched to fill the part's box:
 * the widest point reaches the cross half-extent and the heights span the
 * axis. Units were never the model's to choose.
 */
export function normaliseProfile(
    profile: readonly (readonly [number, number])[],
    hy: number,
): ProfilePoint[] {
    const widest = Math.max(...profile.map(([radius]) => radius));
    const lowest = Math.min(...profile.map(([, height]) => height));
    const highest = Math.max(...profile.map(([, height]) => height));
    const span = highest - lowest;

    return profile.map(([radius, height]) => [
        widest > 0 ? radius / widest : 0,
        // A flat profile — every point at one height — is a disc, not a
        // division by zero: spread it evenly instead.
        span > 0 ? -hy + ((height - lowest) / span) * 2 * hy : hy,
    ]);
}

function sphere(extents: HalfExtents, segments: number, rings: number): Patch[] {
    const profile: ProfilePoint[] = [];

    for (let ring = 0; ring <= rings; ring += 1) {
        const latitude = -Math.PI / 2 + (ring / rings) * Math.PI;

        // The two poles are written as exactly zero so they become single
        // vertices; cos(±π/2) is 6e-17, which would make a ring of them.
        profile.push([
            ring === 0 || ring === rings ? 0 : Math.cos(latitude),
            extents.hy * Math.sin(latitude),
        ]);
    }

    return [revolveRun(profile, extents, segments)];
}

function capsule(extents: HalfExtents, segments: number, quarter: number): Patch[] {
    // Round ends as tall as the part is wide, unless the part is shorter than
    // that — then the ends meet in the middle and it is an ellipsoid.
    const end = Math.min(extents.hy, (extents.hx + extents.hz) / 2);
    const profile: ProfilePoint[] = [];

    for (let step = 0; step <= quarter; step += 1) {
        const angle = -Math.PI / 2 + (step / quarter) * (Math.PI / 2);

        profile.push([step === 0 ? 0 : Math.cos(angle), -extents.hy + end + end * Math.sin(angle)]);
    }

    for (let step = 0; step <= quarter; step += 1) {
        const angle = (step / quarter) * (Math.PI / 2);

        profile.push([
            step === quarter ? 0 : Math.cos(angle),
            extents.hy - end + end * Math.sin(angle),
        ]);
    }

    // One run, no caps: both ends are poles and the profile never turns
    // sharply, so the crease splitter is skipped on purpose.
    return [revolveRun(dropRepeats(profile), extents, segments)];
}

/** The round tube's radius: a little under a third of the narrower cross extent. */
export function torusTube(extents: HalfExtents): number {
    return Math.min(extents.hy, 0.3 * Math.min(extents.hx, extents.hz));
}

/**
 * A ring around the axis — a handle, a wheel's tyre, a rim.
 *
 * Built in real units rather than stretched from a unit torus, which is what
 * the first version did and why every handle came out as a doughnut: scaling a
 * round tube by a tall, narrow box makes the tube tall and narrow with it. Here
 * the ring's *path* is an ellipse filling the box's cross extents and the tube
 * is **round**, a little under a third of the narrower cross extent and never
 * deeper than the box allows along the axis. A mug handle 7 cm tall comes out
 * with a tube about a centimetre thick, which is what a mug handle has.
 *
 * `half`, when given, is the ring's own angle to centre a half ring on — the
 * side facing away from whatever the handle is attached to. The two cut ends
 * are capped flat, and they sit inside the body the assembler moved the ring
 * against, so nothing pokes into a cup.
 */
function torus(
    extents: HalfExtents,
    segments: number,
    tubeSegments: number,
    half: number | null,
): Patch[] {
    const tube = torusTube(extents);
    const pathX = extents.hx - tube;
    const pathZ = extents.hz - tube;
    const closed = half === null;
    const steps = closed ? segments : Math.max(4, Math.round(segments / 2));
    const startAngle = closed ? 0 : half - Math.PI / 2;
    const span = closed ? Math.PI * 2 : Math.PI;
    const patch = emptyPatch();
    const grid: number[][] = [];
    const centres: [number, number, number][] = [];

    for (let around = 0; around < (closed ? steps : steps + 1); around += 1) {
        const angle = startAngle + (around / steps) * span;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        // The ellipse's outward normal at this angle, which is the direction
        // the tube's cross-section opens along.
        const normalLength = Math.hypot(sin / pathX, cos / pathZ);
        const outX = sin / pathX / normalLength;
        const outZ = cos / pathZ / normalLength;
        const ring: number[] = [];

        for (let step = 0; step < tubeSegments; step += 1) {
            const tubeAngle = (step / tubeSegments) * Math.PI * 2;
            const radial = tube * Math.cos(tubeAngle);

            ring.push(
                pushVertex(
                    patch,
                    pathX * sin + outX * radial,
                    tube * Math.sin(tubeAngle),
                    pathZ * cos + outZ * radial,
                ),
            );
        }

        grid.push(ring);
        centres.push([pathX * sin, 0, pathZ * cos]);
    }

    // The same corner order `revolveRun` uses — a tube step is a profile
    // point, a step around is a segment — so the winding argument there holds.
    for (let step = 0; step < tubeSegments; step += 1) {
        const nextStep = (step + 1) % tubeSegments;

        for (let around = 0; around < steps; around += 1) {
            const nextAround = closed ? (around + 1) % steps : around + 1;
            const a = grid[around][step];
            const b = grid[nextAround][step];
            const c = grid[nextAround][nextStep];
            const d = grid[around][nextStep];

            patch.indices.push(a, b, c, a, c, d);
        }
    }

    if (closed) {
        return [patch];
    }

    // Each cut end is a flat disc, wound to face along the path away from the
    // tube: backwards at the start, forwards at the end.
    const ends = [
        { ring: grid[0], centre: centres[0], forward: false },
        { ring: grid[grid.length - 1], centre: centres[centres.length - 1], forward: true },
    ];

    return [
        patch,
        ...ends.map(({ ring, centre, forward }) => {
            const disc = emptyPatch();
            const middle = pushVertex(disc, ...centre);
            const corners = ring.map((vertex) =>
                pushVertex(
                    disc,
                    patch.positions[vertex * 3],
                    patch.positions[vertex * 3 + 1],
                    patch.positions[vertex * 3 + 2],
                ),
            );

            for (let step = 0; step < corners.length; step += 1) {
                const current = corners[step];
                const next = corners[(step + 1) % corners.length];

                // Going round the tube by increasing angle winds the disc to
                // face *along* the path, which is right for the far end.
                disc.indices.push(...(forward ? [middle, next, current] : [middle, current, next]));
            }

            return disc;
        }),
    ];
}

/**
 * Flips a quad's winding if it faces into the part.
 *
 * Every face of a box or a frustum is convex and around the centre, so
 * "outward" is simply "away from the origin" — cheaper to check than to get
 * twenty-four corner orders right by hand, and impossible to get wrong.
 */
function outwardQuad(patch: Patch, corners: readonly (readonly [number, number, number])[]) {
    const [a, b, c, d] = corners;
    const normal = [
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const centre = [0, 1, 2].map((axis) => (a[axis] + b[axis] + c[axis] + d[axis]) / 4);
    const outward = normal[0] * centre[0] + normal[1] * centre[1] + normal[2] * centre[2] >= 0;
    const ordered = outward ? corners : [a, d, c, b];
    const base = patch.positions.length / 3;

    for (const corner of ordered) {
        patch.positions.push(corner[0], corner[1], corner[2]);
    }

    patch.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** A box whose top is `taper` times the size of its bottom — a plain box at 1. */
function box(extents: HalfExtents, taper: number): Patch[] {
    // Never quite a point: a pyramid's top face would be four vertices at one
    // place and two zero-area triangles. The model asks for a cone when it
    // means one.
    const top = Math.max(0.05, taper);
    const corner = (sx: number, sy: number, sz: number) =>
        [
            sx * extents.hx * (sy > 0 ? top : 1),
            sy * extents.hy,
            sz * extents.hz * (sy > 0 ? top : 1),
        ] as const;

    const faces = [
        [corner(1, -1, -1), corner(1, -1, 1), corner(1, 1, 1), corner(1, 1, -1)],
        [corner(-1, -1, -1), corner(-1, 1, -1), corner(-1, 1, 1), corner(-1, -1, 1)],
        [corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)],
        [corner(-1, -1, -1), corner(-1, -1, 1), corner(1, -1, 1), corner(1, -1, -1)],
        [corner(-1, -1, 1), corner(-1, 1, 1), corner(1, 1, 1), corner(1, -1, 1)],
        [corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1)],
    ];

    return faces.map((face) => {
        const patch = emptyPatch();

        outwardQuad(patch, face);

        return patch;
    });
}

/**
 * Coordinates along one edge of a rounded box: flat across the middle, then
 * stepped so the rounding gets even angular spacing. Repeats are dropped, which
 * is what happens on the box's thinnest axis, where the flat middle is gone.
 */
function roundedSamples(half: number, radius: number, steps: number): number[] {
    const inner = half - radius;
    const arc: number[] = [];

    for (let step = steps; step >= 0; step -= 1) {
        arc.push(inner + radius * Math.tan(((step / steps) * Math.PI) / 4));
    }

    const values = [...arc.map((value) => -value), ...arc.toReversed()];

    return values.filter((value, index) => index === 0 || value - values[index - 1] > 1e-9);
}

/**
 * A box with every edge and corner rounded.
 *
 * Each face is a grid on the cube, pushed out onto the rounded surface by
 * moving every point to the inner box and then out along the direction it was
 * pushed. Points on a shared edge land at the same place from both faces,
 * which is what keeps the part closed.
 */
function roundedBox(extents: HalfExtents, steps: number): Patch[] {
    const halves = [extents.hx, extents.hy, extents.hz];
    const radius = 0.35 * Math.min(...halves);
    const samples = halves.map((half) => roundedSamples(half, radius, steps));

    // [normal axis, sign, u axis, v axis], with u × v pointing along the normal.
    const faces: readonly (readonly [number, 1 | -1, number, number])[] = [
        [0, 1, 1, 2],
        [0, -1, 2, 1],
        [1, 1, 2, 0],
        [1, -1, 0, 2],
        [2, 1, 0, 1],
        [2, -1, 1, 0],
    ];

    return faces.map(([normalAxis, sign, uAxis, vAxis]) => {
        const patch = emptyPatch();
        const us = samples[uAxis];
        const vs = samples[vAxis];

        for (const v of vs) {
            for (const u of us) {
                const point = [0, 0, 0];

                point[normalAxis] = sign * halves[normalAxis];
                point[uAxis] = u;
                point[vAxis] = v;

                const inner = point.map((value, axis) =>
                    Math.max(-(halves[axis] - radius), Math.min(halves[axis] - radius, value)),
                );
                const push = point.map((value, axis) => value - inner[axis]);
                const length = Math.hypot(push[0], push[1], push[2]) || 1;

                pushVertex(
                    patch,
                    inner[0] + (push[0] / length) * radius,
                    inner[1] + (push[1] / length) * radius,
                    inner[2] + (push[2] / length) * radius,
                );
            }
        }

        const columns = us.length;

        for (let row = 0; row < vs.length - 1; row += 1) {
            for (let column = 0; column < columns - 1; column += 1) {
                const a = row * columns + column;
                const b = a + 1;
                const c = a + columns + 1;
                const d = a + columns;

                patch.indices.push(a, b, c, a, c, d);
            }
        }

        return patch;
    });
}

export type PrimitiveInput = {
    readonly shape: PartShape;
    readonly extents: HalfExtents;
    readonly taper: number;
    readonly profile: readonly (readonly [number, number])[];
    /** Cylinders and lathes only: an open vessel rather than a solid. */
    readonly hollow: boolean;
    /** Torus only: build the half ring centred on this angle, in its own frame. */
    readonly half: number | null;
    readonly detail: MeshDetail;
};

export function buildPrimitive(input: PrimitiveInput): Patch[] {
    const { extents, detail } = input;
    const segments = RADIAL_SEGMENTS[detail];
    const arc = ARC_SEGMENTS[detail];

    switch (input.shape) {
        case "box":
            return box(extents, input.taper);
        case "rounded_box":
            return roundedBox(extents, Math.max(2, Math.round(arc / 3)));
        case "cylinder": {
            const outline: ProfilePoint[] = [
                [1, -extents.hy],
                [input.taper, extents.hy],
            ];

            return input.hollow
                ? hollowShell(outline, extents, segments)
                : revolveProfile(outline, extents, segments);
        }
        case "cone":
            return revolveProfile(
                [
                    [1, -extents.hy],
                    [0, extents.hy],
                ],
                extents,
                segments,
            );
        case "sphere":
            return sphere(extents, segments, arc);
        case "capsule":
            return capsule(extents, segments, Math.max(2, Math.round(arc / 2)));
        case "torus":
            return torus(extents, segments, Math.max(8, arc), input.half);
        case "lathe": {
            const outline = normaliseProfile(input.profile, extents.hy);

            return input.hollow
                ? hollowShell(outline, extents, segments)
                : revolveProfile(outline, extents, segments);
        }
    }
}
