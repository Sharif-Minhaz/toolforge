import { describe, expect, test } from "bun:test";

import { mapScrollPosition, scrollProgress } from "@/modules/markdown/domain/scroll-sync";

describe("scrollProgress", () => {
    test("reports nothing for a pane with no overflow", () => {
        expect(scrollProgress({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 })).toBe(0);
    });

    test("reports the fraction of the scrollable range", () => {
        expect(scrollProgress({ scrollTop: 300, scrollHeight: 1000, clientHeight: 400 })).toBe(0.5);
    });

    test("clamps an overscrolled position to the ends", () => {
        expect(scrollProgress({ scrollTop: 5000, scrollHeight: 1000, clientHeight: 400 })).toBe(1);
        expect(scrollProgress({ scrollTop: -80, scrollHeight: 1000, clientHeight: 400 })).toBe(0);
    });
});

describe("mapScrollPosition", () => {
    test("puts the other pane at the same fraction of its own range", () => {
        const target = mapScrollPosition(
            { scrollTop: 300, scrollHeight: 1000, clientHeight: 400 },
            { scrollHeight: 2600, clientHeight: 400 },
        );

        expect(target).toBe(1100);
    });

    test("keeps the top aligned", () => {
        expect(
            mapScrollPosition(
                { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 },
                { scrollHeight: 5000, clientHeight: 300 },
            ),
        ).toBe(0);
    });

    test("keeps the bottom aligned", () => {
        expect(
            mapScrollPosition(
                { scrollTop: 600, scrollHeight: 1000, clientHeight: 400 },
                { scrollHeight: 5000, clientHeight: 300 },
            ),
        ).toBe(4700);
    });

    test("stays at the top when the other pane cannot scroll", () => {
        expect(
            mapScrollPosition(
                { scrollTop: 600, scrollHeight: 1000, clientHeight: 400 },
                { scrollHeight: 200, clientHeight: 400 },
            ),
        ).toBe(0);
    });

    test("returns a whole number, since scrollTop is set in pixels", () => {
        const target = mapScrollPosition(
            { scrollTop: 137, scrollHeight: 999, clientHeight: 401 },
            { scrollHeight: 777, clientHeight: 333 },
        );

        expect(Number.isInteger(target)).toBe(true);
    });
});
