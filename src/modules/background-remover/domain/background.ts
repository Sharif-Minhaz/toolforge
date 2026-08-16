import type { BackgroundChoice, BackgroundTab } from "../types";
import {
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_BLUR_STRENGTH,
    MAX_BLUR_STRENGTH,
    MIN_BLUR_STRENGTH,
} from "./constants";

/**
 * The background choice, and the two questions the UI keeps asking about it:
 * which tab it belongs to, and whether the composite on screen still matches it.
 */

/** Nothing behind the cut-out. What every slot starts on. */
export const TRANSPARENT_BACKGROUND: BackgroundChoice = { kind: "transparent" };

export function clampBlurStrength(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_BLUR_STRENGTH;
    }

    return Math.min(MAX_BLUR_STRENGTH, Math.max(MIN_BLUR_STRENGTH, Math.round(value)));
}

/**
 * `#rrggbb`, lower-cased, or `null`.
 *
 * Three-digit shorthand is expanded rather than refused, because a reader pasting
 * `#fff` out of a stylesheet has typed a colour and means it. Anything else — a
 * name, an `rgb()`, a fourth or fifth digit — comes back `null`, and the caller
 * keeps the last good value instead of painting a canvas with `undefined`, which
 * silently means transparent black.
 */
export function parseHexColor(raw: string): string | null {
    const trimmed = raw.trim().toLowerCase();
    const body = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;

    if (!/^[0-9a-f]+$/.test(body)) {
        return null;
    }

    if (body.length === 3) {
        return `#${[...body].map((digit) => digit + digit).join("")}`;
    }

    return body.length === 6 ? `#${body}` : null;
}

/**
 * Which panel a choice belongs under.
 *
 * `transparent` answers `"color"` because it is the first swatch in that row —
 * the ⊘ tile — rather than a tab of its own. Keeping that in one function means
 * the tab strip and the swatch grid cannot disagree about where the reader is.
 */
export function tabForBackground(choice: BackgroundChoice): BackgroundTab {
    switch (choice.kind) {
        case "blur":
            return "blur";
        case "image":
            return "photo";
        case "color":
        case "transparent":
            return "color";
    }
}

/**
 * Whether a composite made under `made` is still the answer to `current`.
 *
 * Compared field by field rather than by reference: the choice is rebuilt on
 * every render of the picker, so two structurally identical objects are the
 * normal case and a reference check would dim a result that is perfectly fresh.
 */
export function isSameBackground(made: BackgroundChoice, current: BackgroundChoice): boolean {
    if (made.kind !== current.kind) {
        return false;
    }

    switch (made.kind) {
        case "transparent":
            return true;
        case "color":
            return made.color === (current as { color: string }).color;
        case "blur":
            return made.strength === (current as { strength: number }).strength;
        case "image":
            return made.url === (current as { url: string }).url;
    }
}

/**
 * The choice a tab opens on when the reader has not made one there yet.
 *
 * The Photo tab has no default and returns `null`: there is no sensible
 * "some picture" to composite, and picking one for the reader would silently
 * publish a stranger's photograph behind their portrait.
 */
export function defaultChoiceForTab(tab: BackgroundTab): BackgroundChoice | null {
    switch (tab) {
        case "blur":
            return { kind: "blur", strength: DEFAULT_BLUR_STRENGTH };
        case "color":
            return { kind: "color", color: DEFAULT_BACKGROUND_COLOR };
        case "photo":
            return null;
    }
}

/**
 * Whether the composite will carry an alpha channel.
 *
 * Drives two things that must agree: the checkerboard behind the preview, and
 * whether the download is offered as a PNG or may be a JPEG. A cut-out on a solid
 * colour is fully opaque — except at its own anti-aliased edge, which is why this
 * is about the *background* rather than about the pixels.
 */
export function keepsTransparency(choice: BackgroundChoice): boolean {
    return choice.kind === "transparent";
}
