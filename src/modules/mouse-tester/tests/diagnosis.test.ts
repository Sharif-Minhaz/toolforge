import { describe, expect, test } from "bun:test";

import { HOLD_TEST_MS, MIN_PRESSES_FOR_VERDICT } from "@/modules/mouse-tester/domain/constants";
import { diagnose, judge, judgeHold } from "@/modules/mouse-tester/domain/diagnosis";
import { createSession } from "@/modules/mouse-tester/domain/session";

describe("judge", () => {
    test("never calls an untouched control healthy", () => {
        expect(judge(0, 0, 20).verdict).toBe("untested");
        expect(judge(5, 0, 20)).toEqual({ verdict: "testing", uses: 5, faults: 0, remaining: 15 });
        expect(judge(20, 0, 20).verdict).toBe("healthy");
    });

    test("separates a single fault from a pattern", () => {
        expect(judge(100, 1, 20).verdict).toBe("suspect");
        expect(judge(100, 3, 20).verdict).toBe("faulty");
        // One in ten is a rate, even with few presses.
        expect(judge(10, 1, 20).verdict).toBe("faulty");
    });
});

describe("judgeHold", () => {
    const idle = createSession().buttons;

    test("asks for a long enough hold", () => {
        expect(judgeHold(idle)).toBe("notRun");
        expect(judgeHold({ ...idle, left: { ...idle.left, longestHold: HOLD_TEST_MS } })).toBe(
            "passed",
        );
    });

    test("reports a drop on any button, whatever else passed", () => {
        expect(
            judgeHold({
                ...idle,
                left: { ...idle.left, longestHold: HOLD_TEST_MS },
                right: { ...idle.right, drops: 1 },
            }),
        ).toBe("dropped");
    });
});

describe("diagnose", () => {
    test("takes the worst verdict among the controls touched", () => {
        const session = createSession();
        const tested = {
            ...session,
            buttons: {
                ...session.buttons,
                left: { ...session.buttons.left, presses: MIN_PRESSES_FOR_VERDICT },
                right: { ...session.buttons.right, presses: 40, chatter: 1 },
            },
        };

        expect(diagnose(session).overall).toBe("untested");
        expect(diagnose(tested).overall).toBe("suspect");
        expect(diagnose(tested).buttons.left.verdict).toBe("healthy");
        expect(diagnose(tested).wheel.verdict).toBe("untested");
    });
});
