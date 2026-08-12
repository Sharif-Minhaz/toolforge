import { describe, expect, test } from "bun:test";

import { DEFAULT_OPTIONS } from "@/modules/image-resizer/domain/constants";
import {
    findPreset,
    platformsInGroup,
    presetDpi,
    presetPixels,
    presetsForPlatform,
    presetsInGroup,
    SIZE_PRESETS,
} from "@/modules/image-resizer/domain/presets";
import { PRESET_GROUPS } from "@/modules/image-resizer/types";

describe("the preset table", () => {
    test("every id is unique", () => {
        const ids = SIZE_PRESETS.map((preset) => preset.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    test("every preset is in a group the picker renders", () => {
        for (const preset of SIZE_PRESETS) {
            expect(PRESET_GROUPS).toContain(preset.group);
        }
    });

    test("every size is positive", () => {
        for (const preset of SIZE_PRESETS) {
            expect(preset.size.width).toBeGreaterThan(0);
            expect(preset.size.height).toBeGreaterThan(0);
        }
    });

    test("the default preset exists", () => {
        expect(findPreset(DEFAULT_OPTIONS.presetId)).not.toBeNull();
    });

    test("every group has at least one entry", () => {
        for (const group of PRESET_GROUPS) {
            expect(presetsInGroup(group).length).toBeGreaterThan(0);
        }
    });

    test("every document photo asks to be letterboxed rather than cut", () => {
        // A passport office rejects a photograph with the top of a head
        // missing, and `cover` is exactly how that happens.
        for (const preset of presetsInGroup("photo")) {
            expect(preset.fit).toBe("contain");
        }
    });
});

describe("presetPixels", () => {
    test("a Bangladeshi passport photo is 45 × 55 mm", () => {
        const preset = findPreset("bd-passport");

        expect(preset?.size).toEqual({
            kind: "physical",
            width: 45,
            height: 55,
            unit: "mm",
            dpi: 300,
        });
    });

    test("which is 531 × 650 px at the resolution it is printed at", () => {
        expect(presetPixels(findPreset("bd-passport")!.size, 300)).toEqual({
            width: 531,
            height: 650,
        });
    });

    test("and twice that at 600 DPI", () => {
        expect(presetPixels(findPreset("bd-passport")!.size, 600)).toEqual({
            width: 1063,
            height: 1299,
        });
    });

    test("a pixel preset ignores the resolution entirely", () => {
        const cover = findPreset("facebook-cover")!.size;

        expect(presetPixels(cover, 72)).toEqual({ width: 820, height: 312 });
        expect(presetPixels(cover, 600)).toEqual({ width: 820, height: 312 });
    });
});

describe("presetDpi", () => {
    test("reports the resolution a physical preset is defined at", () => {
        expect(presetDpi(findPreset("bd-passport")!.size)).toBe(300);
    });

    test("reports nothing for a preset published in pixels", () => {
        expect(presetDpi(findPreset("instagram-story")!.size)).toBeNull();
    });
});

describe("grouping", () => {
    test("lists platforms in the order they first appear", () => {
        const platforms = platformsInGroup("social");

        expect(platforms[0]).toBe("Facebook");
        expect(new Set(platforms).size).toBe(platforms.length);
    });

    test("returns every entry a platform owns", () => {
        const facebook = presetsForPlatform("social", "Facebook");

        expect(facebook.length).toBeGreaterThan(1);
        expect(facebook.every((preset) => preset.platform === "Facebook")).toBe(true);
    });

    test("returns nothing for a platform in the wrong group", () => {
        expect(presetsForPlatform("print", "Facebook")).toEqual([]);
    });
});
