import type { ModelOptions } from "../types";

/** Millimetres, Y up, right-handed. */
export type Vec3 = readonly [number, number, number];

/**
 * How a point of the heightfield becomes a point in space.
 *
 * The three shapes differ in nothing else — same grid, same triangulation, same
 * normals — so the whole difference between a flat plate, a wrapped cylinder and
 * an inflated body is this pair of functions plus the two flags under them.
 * Adding a fourth shape means adding a fourth `Placement`, not a fourth branch
 * in the mesh builder.
 */
export type Placement = {
    /** The front surface. `height` is the heightfield's 0..1 value. */
    outer(u: number, v: number, height: number): Vec3;
    /**
     * The surface behind it. Takes the height too, because an inflated body's
     * back is the mirror of its front rather than a flat backing — and that is
     * exactly what lets the two meet at the outline.
     */
    inner(u: number, v: number, height: number): Vec3;
    /**
     * True when u = 0 and u = 1 are the same place, so the model has no left or
     * right wall and its two edge columns must agree on their height.
     */
    readonly seamless: boolean;
    /**
     * False when the front and back surfaces already meet along their shared
     * edge, so there is no rim to wall in. An inflated body closes itself: both
     * halves are zero-height at the outline, which puts their boundary
     * triangles on the same points wound opposite ways.
     */
    readonly walled: boolean;
};

export type PlacementInput = Pick<
    ModelOptions,
    "shape" | "width" | "depth" | "solid" | "baseThickness"
> & {
    /** The picture's height divided by its width, so millimetres stay exact
     * whichever way the sample grid rounded. */
    readonly aspect: number;
};

export function placementFor(input: PlacementInput): Placement {
    const base = input.solid ? input.baseThickness : 0;
    const heightMm = input.width * input.aspect;

    if (input.shape === "inflate") {
        // Half in front and half behind, so `depth` reads as the full thickness
        // through the thickest point — which is the measurement somebody
        // holding the printed object would take.
        const half = input.depth / 2;

        return {
            seamless: false,
            walled: false,
            outer(u, v, height) {
                return [(u - 0.5) * input.width, (0.5 - v) * heightMm, height * half];
            },
            inner(u, v, height) {
                return [(u - 0.5) * input.width, (0.5 - v) * heightMm, -height * half];
            },
        };
    }

    if (input.shape === "cylinder") {
        // The width is the circumference, because that is the measurement that
        // makes the picture come out undistorted: unrolled, the surface is
        // exactly the plate the plane shape would have produced. A diameter
        // control would look friendlier and quietly stretch every model by π.
        const radius = input.width / (2 * Math.PI);

        return {
            seamless: true,
            walled: true,
            outer(u, v, height) {
                return onCylinder(u, v, radius + base + height * input.depth, heightMm);
            },
            inner(u, v) {
                return onCylinder(u, v, radius, heightMm);
            },
        };
    }

    return {
        seamless: false,
        walled: true,
        outer(u, v, height) {
            return [(u - 0.5) * input.width, (0.5 - v) * heightMm, base + height * input.depth];
        },
        inner(u, v) {
            return [(u - 0.5) * input.width, (0.5 - v) * heightMm, 0];
        },
    };
}

/**
 * u = 0.5 faces +Z, so the middle of the picture is what a viewer looking down
 * the default camera axis sees first rather than the seam.
 */
function onCylinder(u: number, v: number, radius: number, heightMm: number): Vec3 {
    const angle = (u - 0.5) * 2 * Math.PI;

    return [radius * Math.sin(angle), (0.5 - v) * heightMm, radius * Math.cos(angle)];
}
