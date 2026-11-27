/**
 * Whether a result brought on by a press still has to be scrolled to.
 *
 * Pure arithmetic over a bounding box and the viewport height, kept out of
 * `use-result-scroll.ts` so the rule can be tested without a DOM.
 *
 * The rule used to be "skip anything at least 40% visible", and that is the
 * rule that left results below the fold. A scan's progress panel whose top
 * half sat under the fold counted as "already in view", so the press moved
 * nothing — and the result that then replaced it, three times taller, landed
 * with only its heading on screen. A result is only *already being read* when:
 *
 * - **It fits the viewport and all of it is on screen.** Anything shorter than
 *   the screen can be shown whole, so a part of it under the fold is a reason to
 *   scroll, not a reason to stay.
 * - **It is taller than the viewport and already fills most of it.** Such a
 *   result cannot be shown whole; once it covers this much of the screen the
 *   reader is inside it, and moving the page would only lose their place.
 *
 * An empty box — nothing mounted yet, or a slot whose content turned out to be
 * nothing — is neither: it is `wait`, and the hook gives up if it stays empty.
 * Scrolling to a gap is the defect the design-system doc names.
 */

/** A result taller than the screen counts as being read once it covers this much of it. */
export const TALL_RESULT_COVERAGE = 0.6;

export type VerticalBox = {
    readonly top: number;
    readonly bottom: number;
};

export type ResultScrollDecision = "scroll" | "leave" | "wait";

export function decideResultScroll(box: VerticalBox, viewportHeight: number): ResultScrollDecision {
    const height = box.bottom - box.top;

    if (height <= 0) {
        return "wait";
    }

    // No viewport to measure against (a zero-height frame): moving the page
    // cannot be judged, so it is left alone.
    if (viewportHeight <= 0) {
        return "leave";
    }

    if (height <= viewportHeight) {
        return box.top >= 0 && box.bottom <= viewportHeight ? "leave" : "scroll";
    }

    const visible = Math.min(box.bottom, viewportHeight) - Math.max(box.top, 0);

    return visible >= viewportHeight * TALL_RESULT_COVERAGE ? "leave" : "scroll";
}
