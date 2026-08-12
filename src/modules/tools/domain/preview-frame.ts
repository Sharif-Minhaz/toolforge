import type { PixelSize } from "../types";

/**
 * Keeping a tall picture's preview from taking the whole page.
 *
 * A phone screenshot is around 9:19.5 and a scrolling-capture is far worse — at
 * `width: 100%` in a workbench column, one of those renders two or three
 * viewports tall, and every control under it is pushed off the bottom. The
 * reader's next action is invisible from where they are standing.
 *
 * The obvious fix — `max-height` on the image plus `object-contain` — is wrong
 * for **every preview this site has**, because all of them have something laid
 * over the picture: a crop box, a paint canvas, a compare slider. Those are
 * positioned against the *container*, and `object-contain` letterboxes the image
 * inside a container that is now wider than it, so the overlay drifts off the
 * picture and every pointer coordinate is measured against the wrong box.
 *
 * So the height is capped by capping the **width** instead. A frame at
 * `aspect × maxHeight` wide is exactly `maxHeight` tall, the container still
 * hugs the picture on all four sides, and percentages and pointer maths keep
 * meaning what they meant. A wide picture gets a ceiling wider than its column,
 * which is the same as no ceiling at all.
 */

/** The tallest a preview gets on a large screen. */
export const MAX_PREVIEW_HEIGHT_PX = 520;

/**
 * …and on a short one. `svh` rather than `vh` so a mobile browser collapsing its
 * address bar does not resize the frame mid-drag.
 */
export const MAX_PREVIEW_HEIGHT_SVH = 65;

/**
 * The `max-width` that caps a frame's height without letterboxing it.
 *
 * A CSS string rather than a number because the cap is `min(px, svh)` — which
 * cannot be resolved here, and should not be: reading the viewport during render
 * is the hydration bug in
 * `docs/hydration-and-platform-pitfalls.md`, and handing the whole expression to
 * the browser means the server and the client emit the same style attribute.
 */
export function previewFrameMaxWidth(
    size: PixelSize,
    maxHeightPx = MAX_PREVIEW_HEIGHT_PX,
    maxHeightSvh = MAX_PREVIEW_HEIGHT_SVH,
): string {
    // A degenerate size would divide by zero; square is the harmless answer, and
    // nothing that reaches here has ever decoded to a zero-height picture.
    const aspect = size.height > 0 && size.width > 0 ? size.width / size.height : 1;

    return `calc(${aspect} * min(${maxHeightPx}px, ${maxHeightSvh}svh))`;
}
