import { DOCUMENT_WARN_RATIO, MAX_DOCUMENT_BYTES } from "./constants";
import type { ServerUsage } from "../types";

/**
 * How full a server is, as the studio reports it.
 *
 * Pure, because the number decides what the UI *says* as well as what it draws,
 * and a bar that disagrees with its own caption is the kind of thing nobody
 * notices until somebody is locked out and told they have room.
 *
 * Two thresholds, and the gap between them is the whole design:
 *
 * - `MAX_UPLOAD_BYTES` (900 KB) bounds what may be *pasted in*. A server created
 *   at its own ceiling would be full before its first `POST`, so the first thing
 *   a new visitor met would be a refusal.
 * - `MAX_DOCUMENT_BYTES` (1 MB) is where writes stop. The 124 KB between them is
 *   the room to actually use the thing.
 *
 * And `nearLimit` exists so the lock is something a visitor saw coming. A limit
 * somebody meets without warning reads as a fault in the tool.
 */
export function describeUsage(bytes: number): ServerUsage {
    const clamped = Math.max(0, bytes);

    return {
        bytes: clamped,
        limit: MAX_DOCUMENT_BYTES,
        // Rounded once, here, so the bar's width and the label's number are the
        // same number rather than two roundings of one.
        percent: Math.min(100, Math.round((clamped / MAX_DOCUMENT_BYTES) * 100)),
        nearLimit: clamped >= MAX_DOCUMENT_BYTES * DOCUMENT_WARN_RATIO,
        full: clamped >= MAX_DOCUMENT_BYTES,
    };
}
