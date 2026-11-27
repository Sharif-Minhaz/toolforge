import { randomIndex } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";

import { AIM_VILLAINS } from "../types";
import type { AimBiasDirection, AimPoint, AimRun, AimShot, AimSummary, AimTarget } from "../types";
import {
    AIM_ARENA,
    AIM_BIAS_THRESHOLD,
    AIM_EDGE_MARGIN,
    AIM_MIN_TRAVEL,
    AIM_PLACEMENT_ATTEMPTS,
    MAX_AIM_SHOTS,
} from "./constants";

/**
 * The aim trainer: one target at a time, each a fresh flick from wherever the
 * last shot landed.
 *
 * One at a time rather than a field of them, because the point is a
 * measurement, not a score. With a single target the distance travelled and
 * the time taken belong to that one movement, which is what Fitts's law needs:
 * index of difficulty `log₂(D / W + 1)` over the movement time gives a
 * throughput in bits per second, the figure pointing-device research compares
 * mice and hands with (ISO 9241-411 uses the same model). A reaction time alone
 * rewards big, near targets; throughput does not.
 *
 * Everything is in arena units (`AIM_ARENA`) and `performance.now()`
 * milliseconds, and the random source is injected, so a run replays exactly in
 * a test.
 */

export const ARENA_CENTRE: AimPoint = { x: AIM_ARENA.width / 2, y: AIM_ARENA.height / 2 };

export function createAimRun(): AimRun {
    return { startedAt: null, endedAt: null, target: null, shots: [], nextId: 1 };
}

function distance(a: AimPoint, b: AimPoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * A centre for a target of `radius` that keeps it inside the arena and, where
 * possible, at least `AIM_MIN_TRAVEL` from `from`. After the attempts run out
 * the farthest candidate drawn is used: a run must never stall for want of a
 * place to put the next target.
 */
export function placeTarget(from: AimPoint, radius: number, randomBytes: RandomBytes): AimPoint {
    const inset = radius + AIM_EDGE_MARGIN;
    const spanX = Math.max(1, Math.floor(AIM_ARENA.width - inset * 2));
    const spanY = Math.max(1, Math.floor(AIM_ARENA.height - inset * 2));
    let best: AimPoint = { x: inset, y: inset };
    let bestDistance = -1;

    for (let attempt = 0; attempt < AIM_PLACEMENT_ATTEMPTS; attempt += 1) {
        const candidate = {
            x: inset + randomIndex(spanX + 1, randomBytes),
            y: inset + randomIndex(spanY + 1, randomBytes),
        };
        const travel = distance(candidate, from);

        if (travel >= AIM_MIN_TRAVEL) {
            return candidate;
        }

        if (travel > bestDistance) {
            best = candidate;
            bestDistance = travel;
        }
    }

    return best;
}

/**
 * A character for the next target, never the one just shot — two ghosts in a
 * row read as the same target that failed to move.
 */
export function pickVariant(previous: number | null, randomBytes: RandomBytes): number {
    if (previous === null) {
        return randomIndex(AIM_VILLAINS.length, randomBytes);
    }

    // Draw from the others, then step over the previous one.
    const draw = randomIndex(AIM_VILLAINS.length - 1, randomBytes);

    return draw >= previous ? draw + 1 : draw;
}

function spawn(
    run: AimRun,
    from: AimPoint,
    radius: number,
    at: number,
    randomBytes: RandomBytes,
): AimTarget {
    return {
        ...placeTarget(from, radius, randomBytes),
        id: run.nextId,
        radius,
        spawnedAt: at,
        from,
        variant: pickVariant(run.target?.variant ?? null, randomBytes),
    };
}

/** Starts the clock and puts up the first target, a flick away from the centre. */
export function startAim(radius: number, at: number, randomBytes: RandomBytes): AimRun {
    const run = createAimRun();

    return {
        ...run,
        startedAt: at,
        target: spawn(run, ARENA_CENTRE, radius, at, randomBytes),
        nextId: run.nextId + 1,
    };
}

export function isAimExpired(run: AimRun, at: number, durationMs: number): boolean {
    return run.startedAt !== null && at - run.startedAt >= durationMs;
}

export function finishAim(run: AimRun, at: number, durationMs: number): AimRun {
    if (run.startedAt === null || run.endedAt !== null) {
        return run;
    }

    return { ...run, endedAt: Math.min(at, run.startedAt + durationMs), target: null };
}

/**
 * One click at `point`. Inside the target (rim included) is a hit, which
 * scores the movement and puts up the next target from where the shot landed;
 * anywhere else is a miss, and the target stays.
 */
export function shootAim(
    run: AimRun,
    point: AimPoint,
    at: number,
    durationMs: number,
    randomBytes: RandomBytes,
): AimRun {
    if (run.target === null || run.endedAt !== null) {
        return run;
    }

    if (isAimExpired(run, at, durationMs)) {
        return finishAim(run, at, durationMs);
    }

    const target = run.target;
    const gap = distance(point, target);
    const hit = gap <= target.radius;
    const shot: AimShot = {
        at,
        hit,
        offset: {
            x: (point.x - target.x) / target.radius,
            y: (point.y - target.y) / target.radius,
        },
        timeMs: hit ? Math.max(0, at - target.spawnedAt) : 0,
        difficulty: hit ? Math.log2(distance(target.from, target) / (target.radius * 2) + 1) : 0,
    };
    const shots = run.shots.length < MAX_AIM_SHOTS ? [...run.shots, shot] : run.shots;

    if (!hit) {
        return { ...run, shots };
    }

    return {
        ...run,
        shots,
        target: spawn(run, point, target.radius, at, randomBytes),
        nextId: run.nextId + 1,
    };
}

function median(values: readonly number[]): number | null {
    if (values.length === 0) {
        return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function mean(values: readonly number[]): number | null {
    return values.length === 0
        ? null
        : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeAim(run: AimRun): AimSummary {
    const hits = run.shots.filter((shot) => shot.hit);
    const misses = run.shots.length - hits.length;
    const offsets = hits.map((shot) => shot.offset);
    // A hit in under a millisecond cannot be a movement — two events in one
    // frame — and would divide the throughput by nothing.
    const timed = hits.filter((shot) => shot.timeMs > 0);
    const throughput = mean(timed.map((shot) => shot.difficulty / (shot.timeMs / 1000)));
    const biasX = mean(offsets.map((offset) => offset.x));
    const biasY = mean(offsets.map((offset) => offset.y));

    return {
        hits: hits.length,
        misses,
        accuracy: run.shots.length === 0 ? 0 : hits.length / run.shots.length,
        medianTimeMs: median(hits.map((shot) => shot.timeMs)),
        bestTimeMs: hits.length === 0 ? null : Math.min(...hits.map((shot) => shot.timeMs)),
        throughput,
        bias: biasX === null || biasY === null ? null : { x: biasX, y: biasY },
        spread: mean(offsets.map((offset) => Math.hypot(offset.x, offset.y))),
        offsets,
    };
}

/**
 * The grouping's pull in words. Screen y grows downwards, so a positive y is
 * low. Each axis is judged on its own: a strong pull right with a trace of
 * height is "right", not "high right".
 */
export function describeBias(bias: AimPoint): AimBiasDirection {
    const horizontal =
        bias.x >= AIM_BIAS_THRESHOLD ? "Right" : bias.x <= -AIM_BIAS_THRESHOLD ? "Left" : "";
    const vertical =
        bias.y >= AIM_BIAS_THRESHOLD ? "low" : bias.y <= -AIM_BIAS_THRESHOLD ? "high" : "";

    if (vertical === "" && horizontal === "") {
        return "centred";
    }

    if (vertical === "") {
        return horizontal === "Right" ? "right" : "left";
    }

    if (horizontal === "") {
        return vertical;
    }

    return `${vertical}${horizontal}`;
}
