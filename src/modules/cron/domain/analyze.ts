import { isFormattableTimeZone } from "@/modules/tools/domain/zone";
import type {
    CronExplanation,
    CronExpression,
    CronFailure,
    CronScheduleResult,
    CronWeekdayBase,
} from "../types";
import { DEFAULT_TIME_ZONE } from "./constants";
import { explainCron } from "./describe";
import { parseCron } from "./parse";
import { getNextRuns } from "./schedule";

export type CronAnalysisRequest = {
    readonly expression: string;
    readonly weekdayBase: CronWeekdayBase;
    readonly timeZone: string;
    readonly runCount: number;
    /** Injected so the server render and every settled keystroke agree. */
    readonly now: number;
};

export type CronAnalysisSuccess = {
    readonly ok: true;
    readonly expression: CronExpression;
    readonly explanation: CronExplanation;
    readonly schedule: CronScheduleResult;
    /** The zone actually used, which is UTC when the engine cannot format the
     *  requested one. */
    readonly timeZone: string;
    readonly timeZoneSupported: boolean;
};

export type CronAnalysis = CronAnalysisSuccess | CronFailure;

/**
 * The one reading the whole tool runs, shared by the server-rendered first
 * paint and every settled keystroke afterwards. Pure and deterministic given
 * `now`, so the SSR pass already carries the answer.
 *
 * The zone list is a frozen snapshot, so an engine with older data may not know
 * every entry in it. Probing here — by formatting, not by reading a property —
 * keeps the picker rendering the same options on both sides of hydration and
 * catches the difference where the value is used.
 */
export function analyzeCron(request: CronAnalysisRequest): CronAnalysis {
    const parsed = parseCron({
        expression: request.expression,
        weekdayBase: request.weekdayBase,
    });

    if (!parsed.ok) {
        return parsed;
    }

    const supported = isFormattableTimeZone(request.timeZone);
    const timeZone = supported ? request.timeZone : DEFAULT_TIME_ZONE;

    return {
        ok: true,
        expression: parsed,
        explanation: explainCron(parsed),
        schedule: getNextRuns({
            expression: parsed,
            from: request.now,
            timeZone,
            count: request.runCount,
        }),
        timeZone,
        timeZoneSupported: supported,
    };
}
