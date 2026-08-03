import type { CodeTarget } from "../types";

/**
 * Which controls a target actually reads.
 *
 * One predicate per option, shared by the emitters and by the option panel, so
 * there is a single answer to "does this setting apply" rather than two that
 * can drift. The panel disables what a target ignores instead of leaving a
 * control that quietly does nothing.
 */

/** `node:https` is Node by definition; the other two run in either place. */
export function runtimeApplies(target: CodeTarget): boolean {
    return target !== "nodeHttp";
}

/** `node:https` is callback-driven, so neither style describes it. */
export function styleApplies(target: CodeTarget): boolean {
    return target !== "nodeHttp";
}

/** Only `fetch` has a `Headers` class to pass instead of a plain object. */
export function headersStyleApplies(target: CodeTarget): boolean {
    return target === "fetch";
}

/** `node:https` always shows its response handler — there is no call without one. */
export function includeResponseApplies(target: CodeTarget): boolean {
    return target !== "nodeHttp";
}
