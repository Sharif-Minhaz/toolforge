import type { MouseButton, WheelDirection } from "../types";

/**
 * From DOM event fields to the reducer's vocabulary. Kept out of the listener
 * so the mapping is tested rather than trusted.
 */

const BUTTON_BY_INDEX: readonly MouseButton[] = ["left", "middle", "right", "back", "forward"];

/** `MouseEvent.button`; anything past the fifth is not a button every engine reports. */
export function buttonFromIndex(index: number): MouseButton | null {
    return BUTTON_BY_INDEX[index] ?? null;
}

/**
 * The direction of one wheel event. The larger axis wins, so a slightly
 * diagonal flick on a free-spinning wheel still counts as the scroll it was;
 * an event with no movement at all — some drivers send one — is ignored.
 */
export function wheelDirectionOf(deltaX: number, deltaY: number): WheelDirection | null {
    if (deltaY !== 0 && Math.abs(deltaY) >= Math.abs(deltaX)) {
        return deltaY > 0 ? "down" : "up";
    }

    if (deltaX !== 0) {
        return deltaX > 0 ? "right" : "left";
    }

    return null;
}
