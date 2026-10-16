import { describe, expect, test } from "bun:test";

import { buttonFromIndex, wheelDirectionOf } from "@/modules/mouse-tester/domain/input";

describe("buttonFromIndex", () => {
    test("maps the five buttons every engine reports", () => {
        expect([0, 1, 2, 3, 4].map(buttonFromIndex)).toEqual([
            "left",
            "middle",
            "right",
            "back",
            "forward",
        ]);
    });

    test("ignores anything past them", () => {
        expect(buttonFromIndex(5)).toBeNull();
        expect(buttonFromIndex(-1)).toBeNull();
    });
});

describe("wheelDirectionOf", () => {
    test("reads the larger axis", () => {
        expect(wheelDirectionOf(0, 100)).toBe("down");
        expect(wheelDirectionOf(0, -53)).toBe("up");
        expect(wheelDirectionOf(-120, 4)).toBe("left");
        expect(wheelDirectionOf(30, 10)).toBe("right");
        expect(wheelDirectionOf(10, 10)).toBe("down");
    });

    test("ignores an event that moved nothing", () => {
        expect(wheelDirectionOf(0, 0)).toBeNull();
    });
});
