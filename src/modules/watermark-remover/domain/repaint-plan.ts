import type { PixelBox, PixelSize, WatermarkProfile } from "../types";
import { cropAlpha, cropChannels, maskBounds } from "./glyph-mask";
import { rebuildHoles, relaxationPassesFor, removeOverlay } from "./inpaint";
import { INPAINT_MARGIN_PX } from "./video-constants";
import { expandPixelBox } from "./watermark-box";

/**
 * Everything the repaint needs, worked out once from a profile and reusable
 * against any number of samples that share it.
 *
 * A clip has a thousand of those and a still has one, which is the only
 * difference between the two callers — so the arithmetic between "here is the
 * mark" and "here is what to do to each set of pixels" lives here rather than
 * twice.
 */
export type RepaintPlan = {
    /** The rectangle actually written to, in the source picture's own pixels. */
    readonly work: PixelBox;
    /** The profile's three maps, cropped to `work`. */
    readonly alpha: Float32Array;
    readonly rebuild: Float32Array;
    readonly halo: Float32Array;
    /** Relaxation sweeps, sized to the hole this particular mark leaves. */
    readonly passes: number;
};

/**
 * Narrows a search box down to the rectangle worth touching, and crops the
 * profile to it.
 *
 * `null` when the profile reaches nothing at all, which is the same refusal as
 * never having found a mark: there is a profile, and it says there is nothing
 * to take out.
 */
export function planRepaint(
    profile: WatermarkProfile,
    searchBox: PixelBox,
    size: PixelSize,
): RepaintPlan | null {
    // The work rect has to hold the mark's dark ring as well as the mark: it
    // reaches further out than the glyph does, and a rect cut to the glyph would
    // leave most of it in the picture.
    const reached = Uint8Array.from(profile.touched, (value, index) =>
        value === 1 ||
        (profile.halo[index * 3] ?? 0) !== 0 ||
        (profile.halo[index * 3 + 1] ?? 0) !== 0 ||
        (profile.halo[index * 3 + 2] ?? 0) !== 0
            ? 1
            : 0,
    );
    const bounds = maskBounds(reached, searchBox.width, searchBox.height);

    if (bounds === null) {
        return null;
    }

    // The work shrinks from the search box to the mark inside it, plus a border
    // of untouched picture for the fill to read from. On a 1080p frame that is
    // the difference between reading back 46,000 pixels and 12,000.
    const work = expandPixelBox(
        {
            x: searchBox.x + bounds.x,
            y: searchBox.y + bounds.y,
            width: bounds.width,
            height: bounds.height,
        },
        INPAINT_MARGIN_PX,
        size,
    );

    const window = {
        x: work.x - searchBox.x,
        y: work.y - searchBox.y,
        width: work.width,
        height: work.height,
    };

    const alpha = cropAlpha(profile.alpha, searchBox.width, searchBox.height, window);
    const rebuild = cropAlpha(profile.rebuild, searchBox.width, searchBox.height, window);
    const halo = cropChannels(profile.halo, searchBox.width, searchBox.height, window);

    // Sized here rather than per sample, from the solid core this mark actually
    // has. A constant is right for a thin sparkle and far too few sweeps for a
    // fat one, and an under-converged fill is a visible patch.
    const core = maskBounds(rebuildHoles(alpha, rebuild), work.width, work.height);

    return {
        work,
        alpha,
        rebuild,
        halo,
        passes: relaxationPassesFor(core === null ? 0 : Math.max(core.width, core.height)),
    };
}

/** Applies a plan to one rectangle of RGBA, in place. The plan's own geometry. */
export function applyRepaint(patch: Uint8ClampedArray, plan: RepaintPlan): void {
    removeOverlay(
        patch,
        plan.work.width,
        plan.work.height,
        plan.alpha,
        plan.rebuild,
        plan.passes,
        plan.halo,
    );
}
