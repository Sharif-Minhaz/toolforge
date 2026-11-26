import {
    FAVICON_APPLE_TOUCH_NAME,
    FAVICON_ICO_SIZES,
    FAVICON_MASKABLE_PNGS,
    FAVICON_PNGS,
} from "@/modules/tools/domain/favicon";
import type {
    FaviconOptions,
    GlyphLayout,
    GlyphZone,
    IconPlan,
    IconPurpose,
    InkBox,
} from "../types";
import {
    BARE_GLYPH_FILL,
    CIRCLE_GLYPH_FILL,
    MASKABLE_SAFE_ZONE,
    PLATE_GLYPH_FILL,
} from "./constants";
import { maskableApplies } from "./options";

type PlanOptions = Pick<FaviconOptions, "shape" | "transparent" | "maskable">;

function square(side: number): GlyphZone {
    return { kind: "square", side };
}

/** What one icon is drawn on, and where its glyph has to fit. */
export function planIcon(purpose: IconPurpose, size: number, options: PlanOptions): IconPlan {
    if (options.transparent) {
        return { size, plate: "none", zone: square(size * BARE_GLYPH_FILL) };
    }

    if (purpose === "maskable") {
        // Full bleed: the launcher's mask is the shape, and it may be any shape
        // that contains the safe-zone circle.
        return {
            size,
            plate: "square",
            zone: { kind: "circle", diameter: size * MASKABLE_SAFE_ZONE },
        };
    }

    // iOS rounds the home-screen icon itself. A pre-rounded or circular one
    // gets its corners cut a second time, inside the first — so the apple icon
    // is always a full-bleed square, whatever shape the rest of the pack takes.
    const plate = purpose === "apple" ? "square" : options.shape;

    return {
        size,
        plate,
        zone:
            plate === "circle"
                ? { kind: "circle", diameter: size * CIRCLE_GLYPH_FILL }
                : square(size * PLATE_GLYPH_FILL),
    };
}

/**
 * Scales measured ink to fit a zone and centres the ink — not the advance box,
 * not the baseline. A Bangla glyph's matra and an emoji's bitmap both sit well
 * off the Latin baseline, so centring anything but the ink puts them off-centre.
 *
 * Returns `null` for ink with no area, which a font produces for a glyph it
 * cannot draw at all.
 */
export function fitGlyph(ink: InkBox, measuredAt: number, plan: IconPlan): GlyphLayout | null {
    const width = ink.left + ink.right;
    const height = ink.ascent + ink.descent;

    if (!(width > 0 && height > 0)) {
        return null;
    }

    const scale =
        plan.zone.kind === "square"
            ? Math.min(plan.zone.side / width, plan.zone.side / height)
            : plan.zone.diameter / Math.hypot(width, height);

    const centre = plan.size / 2;

    return {
        fontSize: measuredAt * scale,
        x: centre - ((ink.right - ink.left) * scale) / 2,
        y: centre + ((ink.ascent - ink.descent) * scale) / 2,
    };
}

export type PlannedPng = {
    readonly name: string;
    readonly plan: IconPlan;
};

/**
 * Every icon the pack draws. Each size is drawn on its own from the text, never
 * scaled down from a larger one — a 16 shrunk from a 512 is mush.
 */
export function planPack(options: PlanOptions): {
    readonly ico: readonly IconPlan[];
    readonly pngs: readonly PlannedPng[];
} {
    const maskable = maskableApplies(options) ? FAVICON_MASKABLE_PNGS : [];

    return {
        ico: FAVICON_ICO_SIZES.map((size) => planIcon("icon", size, options)),
        pngs: [
            ...FAVICON_PNGS.map((spec) => ({
                name: spec.name,
                plan: planIcon(
                    spec.name === FAVICON_APPLE_TOUCH_NAME ? "apple" : "icon",
                    spec.size,
                    options,
                ),
            })),
            ...maskable.map((spec) => ({
                name: spec.name,
                plan: planIcon("maskable", spec.size, options),
            })),
        ],
    };
}
