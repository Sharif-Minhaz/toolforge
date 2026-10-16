import {
    FAULTY_FAULT_RATE,
    FAULTY_MIN_FAULTS,
    HOLD_TEST_MS,
    MIN_PRESSES_FOR_VERDICT,
    MIN_WHEEL_NOTCHES_FOR_VERDICT,
} from "./constants";
import {
    MOUSE_BUTTONS,
    VERDICTS,
    type ButtonStats,
    type HoldResult,
    type MouseButton,
    type MouseSession,
    type Verdict,
    type WheelStats,
} from "../types";

/**
 * Turns counts into a verdict a person can act on.
 *
 * "Healthy" is never awarded on no evidence: a button pressed three times
 * without a fault has not been shown to be fine, only not yet shown to be
 * broken, which is what `testing` says.
 */

export type ControlDiagnosis = {
    readonly verdict: Verdict;
    /** Uses so far — presses for a button, up-and-down notches for the wheel. */
    readonly uses: number;
    readonly faults: number;
    /** How many more uses before a fault-free control is called healthy. */
    readonly remaining: number;
};

export type SessionDiagnosis = {
    readonly buttons: Readonly<Record<MouseButton, ControlDiagnosis>>;
    readonly wheel: ControlDiagnosis;
    readonly hold: HoldResult;
    /** The worst verdict among the controls that have been touched at all. */
    readonly overall: Verdict;
};

export function judge(uses: number, faults: number, minimum: number): ControlDiagnosis {
    const remaining = Math.max(0, minimum - uses);

    if (uses === 0) {
        return { verdict: "untested", uses, faults, remaining };
    }

    if (faults === 0) {
        return { verdict: remaining > 0 ? "testing" : "healthy", uses, faults, remaining };
    }

    const faulty = faults >= FAULTY_MIN_FAULTS || faults / uses >= FAULTY_FAULT_RATE;

    return { verdict: faulty ? "faulty" : "suspect", uses, faults, remaining: 0 };
}

export function judgeButton(stats: ButtonStats): ControlDiagnosis {
    return judge(stats.presses, stats.chatter + stats.drops, MIN_PRESSES_FOR_VERDICT);
}

/**
 * Up and down only. A tilt wheel is a pair of switches, not an encoder, and
 * cannot reverse — a person with no tilt wheel should not see the wheel held
 * at `testing` for want of a sideways scroll.
 */
export function judgeWheel(wheel: WheelStats): ControlDiagnosis {
    return judge(
        wheel.counts.up + wheel.counts.down,
        wheel.reversals,
        MIN_WHEEL_NOTCHES_FOR_VERDICT,
    );
}

export function judgeHold(buttons: Readonly<Record<MouseButton, ButtonStats>>): HoldResult {
    const all = MOUSE_BUTTONS.map((button) => buttons[button]);

    if (all.some((stats) => stats.drops > 0)) {
        return "dropped";
    }

    return all.some((stats) => stats.longestHold >= HOLD_TEST_MS) ? "passed" : "notRun";
}

export function diagnose(session: MouseSession): SessionDiagnosis {
    const buttons = {
        left: judgeButton(session.buttons.left),
        middle: judgeButton(session.buttons.middle),
        right: judgeButton(session.buttons.right),
        back: judgeButton(session.buttons.back),
        forward: judgeButton(session.buttons.forward),
    };
    const wheel = judgeWheel(session.wheel);
    const verdicts = [...MOUSE_BUTTONS.map((button) => buttons[button].verdict), wheel.verdict];

    return {
        buttons,
        wheel,
        hold: judgeHold(session.buttons),
        overall: verdicts.reduce(worse, "untested"),
    };
}

function worse(a: Verdict, b: Verdict): Verdict {
    return VERDICTS.indexOf(b) > VERDICTS.indexOf(a) ? b : a;
}
