import { describe, expect, test } from "bun:test";

import { hiddenOnPhone, isPhone } from "@/modules/tools/domain/device";
import { getTools } from "@/modules/tools/domain/tool-catalog";

const ANDROID_PHONE =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const FIREFOX_ANDROID = "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0";
const DESKTOP =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
// iPadOS asks for desktop sites and says it is a Mac.
const IPAD =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";

describe("isPhone", () => {
    test("reads phones from the user-agent string", () => {
        expect(isPhone(ANDROID_PHONE, undefined)).toBe(true);
        expect(isPhone(IPHONE, undefined)).toBe(true);
        expect(isPhone(FIREFOX_ANDROID, undefined)).toBe(true);
    });

    test("a desktop and a tablet are not phones", () => {
        expect(isPhone(DESKTOP, undefined)).toBe(false);
        expect(isPhone(ANDROID_TABLET, undefined)).toBe(false);
        expect(isPhone(IPAD, undefined)).toBe(false);
    });

    test("the browser's own mobile hint wins over the string", () => {
        expect(isPhone(DESKTOP, true)).toBe(true);
        expect(isPhone(ANDROID_PHONE, false)).toBe(false);
    });
});

describe("hiddenOnPhone", () => {
    test("exactly the keyboard and mouse testers", () => {
        expect(
            getTools()
                .filter(hiddenOnPhone)
                .map((tool) => tool.id)
                .sort(),
        ).toEqual(["keyboard-tester", "mouse-tester"]);
    });
});
