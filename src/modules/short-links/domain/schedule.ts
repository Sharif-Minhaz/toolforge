import type { ScheduleState } from "../types";

/**
 * When a short link is live.
 *
 * Both bounds are instants — a number of milliseconds and nothing else. The
 * wall-clock date a reader picks is turned into one by `tools/domain/zone.ts`
 * against a named zone before it ever reaches this file, so nothing here reads
 * the host's own zone and a server render agrees with its hydrated counterpart.
 */

export type ScheduleFailureReason = "invalid_schedule" | "expiry_in_past";

export type ScheduleResult =
    { readonly ok: true } | { readonly ok: false; readonly reason: ScheduleFailureReason };

/**
 * Half-open on both ends: the link is live from `startsAt` inclusive until
 * `expiresAt` exclusive, so an expiry set to midnight means the link dies as the
 * day begins rather than lingering for a millisecond into it.
 */
export function scheduleState(
    startsAt: Date | null,
    expiresAt: Date | null,
    nowMs: number,
): ScheduleState {
    if (startsAt !== null && nowMs < startsAt.getTime()) {
        return "pending";
    }

    if (expiresAt !== null && nowMs >= expiresAt.getTime()) {
        return "expired";
    }

    return "active";
}

/**
 * Whether a window is one a link could ever be live in.
 *
 * An expiry already in the past is refused on update as well as on creation: an
 * owner reviving a dead link has to push the expiry forward, which is the thing
 * they meant anyway, and it keeps "saved successfully" from meaning "still
 * broken".
 */
export function checkSchedule(
    startsAt: Date | null,
    expiresAt: Date | null,
    nowMs: number,
): ScheduleResult {
    if (startsAt !== null && expiresAt !== null && startsAt.getTime() >= expiresAt.getTime()) {
        return { ok: false, reason: "invalid_schedule" };
    }

    if (expiresAt !== null && expiresAt.getTime() <= nowMs) {
        return { ok: false, reason: "expiry_in_past" };
    }

    return { ok: true };
}
