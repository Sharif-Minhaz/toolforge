import { toPixels } from "./units";
import type { PresetGroup, PresetSize, SizePreset } from "../types";
import type { PixelSize } from "@/modules/tools/types";

/**
 * The sizes somebody else decided.
 *
 * Every entry here is a number a third party publishes and can change, which
 * makes this a table of **data rather than copy** — "Facebook", "Cover",
 * "Bangladesh Passport" are proper names, and a Bangla translation of them
 * would make the picker harder to use rather than easier. The group headings
 * around the list are copy and are localised.
 *
 * Document photos are stored in millimetres with the resolution the issuing
 * authority prints at, never as pixels. A Bangladeshi passport photograph is
 * 45 × 55 mm — 532 × 650 px at 300 DPI, and 1063 × 1299 at 600 — and baking in
 * one of those would hand somebody printing at the other a photograph half the
 * size their form allows. `presetPixels` does the arithmetic at the DPI the
 * reader is actually working at.
 */

export const SIZE_PRESETS: readonly SizePreset[] = [
    // Document photographs. `contain` on every one of them: a passport office
    // rejects a photograph with the top of a head cut off, and `cover` is how
    // that happens.
    {
        id: "bd-passport",
        group: "photo",
        platform: "Bangladesh",
        label: "Passport (45 × 55 mm)",
        size: { kind: "physical", width: 45, height: 55, unit: "mm", dpi: 300 },
        fit: "contain",
    },
    {
        id: "bd-stamp",
        group: "photo",
        platform: "Bangladesh",
        label: "Stamp (25 × 30 mm)",
        size: { kind: "physical", width: 25, height: 30, unit: "mm", dpi: 300 },
        fit: "contain",
    },
    {
        id: "bd-nid",
        group: "photo",
        platform: "Bangladesh",
        label: "NID / Form (35 × 45 mm)",
        size: { kind: "physical", width: 35, height: 45, unit: "mm", dpi: 300 },
        fit: "contain",
    },
    {
        id: "us-passport",
        group: "photo",
        platform: "United States",
        label: "Passport (2 × 2 in)",
        size: { kind: "physical", width: 2, height: 2, unit: "in", dpi: 300 },
        fit: "contain",
    },
    {
        id: "schengen-visa",
        group: "photo",
        platform: "Schengen",
        label: "Visa (35 × 45 mm)",
        size: { kind: "physical", width: 35, height: 45, unit: "mm", dpi: 300 },
        fit: "contain",
    },
    {
        id: "uk-passport",
        group: "photo",
        platform: "United Kingdom",
        label: "Passport (35 × 45 mm)",
        size: { kind: "physical", width: 35, height: 45, unit: "mm", dpi: 300 },
        fit: "contain",
    },
    {
        id: "india-passport",
        group: "photo",
        platform: "India",
        label: "Passport (51 × 51 mm)",
        size: { kind: "physical", width: 51, height: 51, unit: "mm", dpi: 300 },
        fit: "contain",
    },
    {
        id: "china-visa",
        group: "photo",
        platform: "China",
        label: "Visa (33 × 48 mm)",
        size: { kind: "physical", width: 33, height: 48, unit: "mm", dpi: 300 },
        fit: "contain",
    },

    // Paper. Landscape by convention; the aspect lock and a swap do the rest.
    {
        id: "print-4x6",
        group: "print",
        platform: "Print",
        label: "4 × 6 in",
        size: { kind: "physical", width: 6, height: 4, unit: "in", dpi: 300 },
    },
    {
        id: "print-5x7",
        group: "print",
        platform: "Print",
        label: "5 × 7 in",
        size: { kind: "physical", width: 7, height: 5, unit: "in", dpi: 300 },
    },
    {
        id: "print-8x10",
        group: "print",
        platform: "Print",
        label: "8 × 10 in",
        size: { kind: "physical", width: 10, height: 8, unit: "in", dpi: 300 },
    },
    {
        id: "print-a4",
        group: "print",
        platform: "Print",
        label: "A4 (210 × 297 mm)",
        size: { kind: "physical", width: 210, height: 297, unit: "mm", dpi: 300 },
    },
    {
        id: "print-a5",
        group: "print",
        platform: "Print",
        label: "A5 (148 × 210 mm)",
        size: { kind: "physical", width: 148, height: 210, unit: "mm", dpi: 300 },
    },

    // Screens. Pixels, because that is what the platforms publish.
    {
        id: "facebook-profile",
        group: "social",
        platform: "Facebook",
        label: "Profile (170 × 170)",
        size: { kind: "pixels", width: 170, height: 170 },
    },
    {
        id: "facebook-cover",
        group: "social",
        platform: "Facebook",
        label: "Cover (820 × 312)",
        size: { kind: "pixels", width: 820, height: 312 },
    },
    {
        id: "facebook-post",
        group: "social",
        platform: "Facebook",
        label: "Post (1200 × 900)",
        size: { kind: "pixels", width: 1200, height: 900 },
    },
    {
        id: "facebook-ad",
        group: "social",
        platform: "Facebook",
        label: "Ad (1280 × 720)",
        size: { kind: "pixels", width: 1280, height: 720 },
    },
    {
        id: "instagram-profile",
        group: "social",
        platform: "Instagram",
        label: "Profile (320 × 320)",
        size: { kind: "pixels", width: 320, height: 320 },
    },
    {
        id: "instagram-square",
        group: "social",
        platform: "Instagram",
        label: "Square post (1080 × 1080)",
        size: { kind: "pixels", width: 1080, height: 1080 },
    },
    {
        id: "instagram-portrait",
        group: "social",
        platform: "Instagram",
        label: "Portrait post (1080 × 1350)",
        size: { kind: "pixels", width: 1080, height: 1350 },
    },
    {
        id: "instagram-story",
        group: "social",
        platform: "Instagram",
        label: "Story (1080 × 1920)",
        size: { kind: "pixels", width: 1080, height: 1920 },
    },
    {
        id: "x-profile",
        group: "social",
        platform: "X (Twitter)",
        label: "Profile (400 × 400)",
        size: { kind: "pixels", width: 400, height: 400 },
    },
    {
        id: "x-header",
        group: "social",
        platform: "X (Twitter)",
        label: "Header (1500 × 500)",
        size: { kind: "pixels", width: 1500, height: 500 },
    },
    {
        id: "x-post",
        group: "social",
        platform: "X (Twitter)",
        label: "Post (1600 × 900)",
        size: { kind: "pixels", width: 1600, height: 900 },
    },
    {
        id: "youtube-thumbnail",
        group: "social",
        platform: "YouTube",
        label: "Thumbnail (1280 × 720)",
        size: { kind: "pixels", width: 1280, height: 720 },
    },
    {
        id: "youtube-channel-art",
        group: "social",
        platform: "YouTube",
        label: "Channel art (2560 × 1440)",
        size: { kind: "pixels", width: 2560, height: 1440 },
    },
    {
        id: "linkedin-profile",
        group: "social",
        platform: "LinkedIn",
        label: "Profile (400 × 400)",
        size: { kind: "pixels", width: 400, height: 400 },
    },
    {
        id: "linkedin-cover",
        group: "social",
        platform: "LinkedIn",
        label: "Cover (1584 × 396)",
        size: { kind: "pixels", width: 1584, height: 396 },
    },
    {
        id: "pinterest-pin",
        group: "social",
        platform: "Pinterest",
        label: "Pin (1000 × 1500)",
        size: { kind: "pixels", width: 1000, height: 1500 },
    },
    {
        id: "tiktok-video",
        group: "social",
        platform: "TikTok",
        label: "Video cover (1080 × 1920)",
        size: { kind: "pixels", width: 1080, height: 1920 },
    },
    {
        id: "whatsapp-dp",
        group: "social",
        platform: "WhatsApp",
        label: "Profile (500 × 500)",
        size: { kind: "pixels", width: 500, height: 500 },
    },
];

export const PRESETS_BY_ID: ReadonlyMap<string, SizePreset> = new Map(
    SIZE_PRESETS.map((preset) => [preset.id, preset]),
);

export function findPreset(id: string): SizePreset | null {
    return PRESETS_BY_ID.get(id) ?? null;
}

export function presetsInGroup(group: PresetGroup): readonly SizePreset[] {
    return SIZE_PRESETS.filter((preset) => preset.group === group);
}

/** The platform names in a group, in the order they first appear. */
export function platformsInGroup(group: PresetGroup): readonly string[] {
    return [...new Set(presetsInGroup(group).map((preset) => preset.platform))];
}

export function presetsForPlatform(group: PresetGroup, platform: string): readonly SizePreset[] {
    return presetsInGroup(group).filter((preset) => preset.platform === platform);
}

/**
 * A preset's size in pixels, at the resolution the reader is working at.
 *
 * A pixel preset ignores the DPI entirely — 1080 × 1080 is 1080 × 1080 whatever
 * a printer would do with it — while a physical one is measured at the DPI
 * passed in, which is what makes "45 × 55 mm at 600 DPI" produce a file twice
 * as wide rather than a file the wrong size.
 */
export function presetPixels(size: PresetSize, dpi: number): PixelSize {
    if (size.kind === "pixels") {
        return { width: size.width, height: size.height };
    }

    return {
        width: toPixels(size.width, size.unit, dpi),
        height: toPixels(size.height, size.unit, dpi),
    };
}

/** The resolution a preset is defined at, for the DPI field to follow. */
export function presetDpi(size: PresetSize): number | null {
    return size.kind === "physical" ? size.dpi : null;
}
