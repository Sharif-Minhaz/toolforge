import { describe, expect, test } from "bun:test";

import {
    ARENA_CENTRE,
    describeBias,
    finishAim,
    placeTarget,
    shootAim,
    startAim,
    summarizeAim,
} from "@/modules/mouse-tester/domain/aim";
import {
    AIM_ARENA,
    AIM_EDGE_MARGIN,
    AIM_MIN_TRAVEL,
} from "@/modules/mouse-tester/domain/constants";
import type { AimRun, AimTarget } from "@/modules/mouse-tester/types";

const DURATION = 30_000;
const RADIUS = 28;

/** A seeded xorshift, so a run is random-looking and the same every time. */
function seededBytes(seed = 0x9e3779b9): (length: number) => Uint8Array {
    let state = seed >>> 0;

    return (length) => {
        const bytes = new Uint8Array(length);

        for (let index = 0; index < length; index += 1) {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            state >>>= 0;
            bytes[index] = state & 0xff;
        }

        return bytes;
    };
}

/** Always the same draw: every candidate lands on one spot. */
const stuckBytes = (length: number) => new Uint8Array(length);

function targetOf(run: AimRun): AimTarget {
    if (run.target === null) {
        throw new Error("no target");
    }

    return run.target;
}

function hitCentre(run: AimRun, at: number, random = seededBytes()): AimRun {
    const target = targetOf(run);

    return shootAim(run, { x: target.x, y: target.y }, at, DURATION, random);
}

describe("placeTarget", () => {
    test("keeps the whole target inside the arena, and a flick away", () => {
        const random = seededBytes();

        for (let index = 0; index < 500; index += 1) {
            const point = placeTarget(ARENA_CENTRE, RADIUS, random);

            expect(point.x).toBeGreaterThanOrEqual(RADIUS + AIM_EDGE_MARGIN);
            expect(point.x).toBeLessThanOrEqual(AIM_ARENA.width - RADIUS - AIM_EDGE_MARGIN);
            expect(point.y).toBeGreaterThanOrEqual(RADIUS + AIM_EDGE_MARGIN);
            expect(point.y).toBeLessThanOrEqual(AIM_ARENA.height - RADIUS - AIM_EDGE_MARGIN);
            expect(
                Math.hypot(point.x - ARENA_CENTRE.x, point.y - ARENA_CENTRE.y),
            ).toBeGreaterThanOrEqual(AIM_MIN_TRAVEL);
        }
    });

    test("never stalls when no draw is far enough", () => {
        // Every draw is the top-left corner; from there nothing is far enough.
        const corner = { x: RADIUS + AIM_EDGE_MARGIN, y: RADIUS + AIM_EDGE_MARGIN };

        expect(placeTarget(corner, RADIUS, stuckBytes)).toEqual(corner);
    });
});

describe("a run", () => {
    test("a hit scores the movement and spawns the next target from the shot", () => {
        const random = seededBytes();
        const run = startAim(RADIUS, 1000, random);
        const first = targetOf(run);
        const after = hitCentre(run, 1400, random);

        expect(after.shots).toHaveLength(1);
        expect(after.shots[0]).toMatchObject({ hit: true, timeMs: 400, offset: { x: 0, y: 0 } });
        expect(after.target?.id).not.toBe(first.id);
        expect(after.target?.from).toEqual({ x: first.x, y: first.y });
        expect(after.target?.spawnedAt).toBe(1400);
    });

    test("Fitts's index of difficulty is log2(D / W + 1), with W the diameter", () => {
        const run = startAim(RADIUS, 0, seededBytes());
        const target = targetOf(run);
        const travel = Math.hypot(target.x - ARENA_CENTRE.x, target.y - ARENA_CENTRE.y);
        const after = hitCentre(run, 500);

        expect(after.shots[0].difficulty).toBeCloseTo(Math.log2(travel / (RADIUS * 2) + 1), 12);
    });

    test("the rim is a hit; a pixel past it is a miss and the target stays", () => {
        const run = startAim(RADIUS, 0, seededBytes());
        const target = targetOf(run);
        const rim = shootAim(
            run,
            { x: target.x + RADIUS, y: target.y },
            100,
            DURATION,
            seededBytes(),
        );
        const past = shootAim(
            run,
            { x: target.x + RADIUS + 1, y: target.y },
            100,
            DURATION,
            seededBytes(),
        );

        expect(rim.shots[0].hit).toBe(true);
        expect(past.shots[0].hit).toBe(false);
        expect(past.target).toBe(target);
    });

    test("a shot after the clock ran out ends the run instead of counting", () => {
        const run = startAim(RADIUS, 0, seededBytes());
        const late = hitCentre(run, DURATION + 1);

        expect(late.shots).toHaveLength(0);
        expect(late.endedAt).toBe(DURATION);
        expect(late.target).toBeNull();
        expect(finishAim(late, DURATION * 2, DURATION)).toBe(late);
    });
});

describe("summarizeAim", () => {
    test("accuracy, times, bias and spread", () => {
        const random = seededBytes();
        let run = startAim(RADIUS, 0, random);

        // A miss, then three hits that all land half a radius to the right.
        run = shootAim(run, { x: 0, y: 0 }, 100, DURATION, random);

        for (const at of [300, 700, 1300]) {
            const target = targetOf(run);
            run = shootAim(run, { x: target.x + RADIUS / 2, y: target.y }, at, DURATION, random);
        }

        const summary = summarizeAim(run);

        expect(summary.hits).toBe(3);
        expect(summary.misses).toBe(1);
        expect(summary.accuracy).toBeCloseTo(0.75, 12);
        // 300, 400 and 600 ms from each appearance.
        expect(summary.medianTimeMs).toBe(400);
        expect(summary.bestTimeMs).toBe(300);
        expect(summary.bias?.x).toBeCloseTo(0.5, 12);
        expect(summary.bias?.y).toBeCloseTo(0, 12);
        expect(summary.spread).toBeCloseTo(0.5, 12);
        expect(summary.throughput).toBeGreaterThan(0);
    });

    test("an empty run reads null, not NaN", () => {
        const summary = summarizeAim(startAim(RADIUS, 0, seededBytes()));

        expect(summary).toMatchObject({
            hits: 0,
            misses: 0,
            accuracy: 0,
            medianTimeMs: null,
            throughput: null,
            bias: null,
        });
    });
});

describe("describeBias", () => {
    test("names the pull, axis by axis, with screen y growing down", () => {
        expect(describeBias({ x: 0.05, y: -0.05 })).toBe("centred");
        expect(describeBias({ x: 0.3, y: 0.02 })).toBe("right");
        expect(describeBias({ x: -0.3, y: 0 })).toBe("left");
        expect(describeBias({ x: 0, y: -0.2 })).toBe("high");
        expect(describeBias({ x: 0, y: 0.2 })).toBe("low");
        expect(describeBias({ x: 0.2, y: 0.2 })).toBe("lowRight");
        expect(describeBias({ x: -0.2, y: -0.2 })).toBe("highLeft");
    });
});
