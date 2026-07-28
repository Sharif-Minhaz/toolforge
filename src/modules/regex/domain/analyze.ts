import type {
    ExplanationNode,
    HighlightSpan,
    RegexAnalysis,
    RegexAnalysisRequest,
    RegexDiagnostic,
    RegexFailure,
    RegexGroupInfo,
} from "../types";
import { compilePattern, toCompiledSource } from "./compile";
import { MAX_PATTERN_LENGTH, MAX_REPLACEMENT_LENGTH, MAX_TEST_STRING_LENGTH } from "./constants";
import { toExplanation } from "./explain";
import { DEFAULT_EXECUTION_LIMITS, findMatches, type Clock, type ExecutionLimits } from "./execute";
import { hasFlag, toEngineFlags } from "./flags";
import { toHighlightSpans } from "./highlight";
import { lintPattern } from "./lint";
import { parsePattern } from "./parse";
import { listMatches, substituteAll } from "./replace";

/**
 * The one analysis the whole tool runs — on the server for the first paint, and
 * in the worker for every settled keystroke after it. Pure and deterministic
 * apart from the injected clock, so both passes agree.
 */

export type AnalyzeOptions = {
    readonly limits?: ExecutionLimits;
    readonly clock?: Clock;
};

function emptyAnalysis(overrides: Partial<RegexAnalysis> = {}): RegexAnalysis {
    return {
        highlights: [],
        explanation: [],
        diagnostics: [],
        failure: null,
        matches: [],
        groups: [],
        truncated: false,
        durationMs: 0,
        output: "",
        compiledSource: "",
        compiledFlags: "",
        ...overrides,
    };
}

type PatternView = {
    readonly highlights: readonly HighlightSpan[];
    readonly explanation: readonly ExplanationNode[];
    readonly diagnostics: readonly RegexDiagnostic[];
    readonly groups: readonly RegexGroupInfo[];
    readonly compiledSource: string;
};

/**
 * Everything derivable from the pattern alone. Kept separate because it stays
 * valid — and worth showing — even when the input is too long to run, or the
 * engine refuses the pattern outright.
 */
function describePattern(request: RegexAnalysisRequest): PatternView {
    const extended = hasFlag(request.flags, "extended");
    const { root, groups } = parsePattern(request.pattern, { extended });

    return {
        highlights: toHighlightSpans(request.pattern, root),
        explanation: toExplanation(request.pattern, root, {
            multiline: hasFlag(request.flags, "multiline"),
            dotAll: hasFlag(request.flags, "dotAll"),
        }),
        diagnostics: lintPattern(request.pattern, root),
        groups,
        compiledSource: toCompiledSource(request.pattern, root, {
            extended,
            ungreedy: hasFlag(request.flags, "ungreedy"),
        }),
    };
}

function withPattern(view: PatternView, overrides: Partial<RegexAnalysis>): RegexAnalysis {
    return emptyAnalysis({
        highlights: view.highlights,
        explanation: view.explanation,
        diagnostics: view.diagnostics,
        groups: view.groups,
        ...overrides,
    });
}

function limitFailure(request: RegexAnalysisRequest): RegexFailure | null {
    if (request.pattern.length > MAX_PATTERN_LENGTH) {
        return { reason: "pattern_too_long", limit: MAX_PATTERN_LENGTH };
    }

    if (request.testString.length > MAX_TEST_STRING_LENGTH) {
        return { reason: "input_too_long", limit: MAX_TEST_STRING_LENGTH };
    }

    if (request.replacement.length > MAX_REPLACEMENT_LENGTH) {
        return { reason: "replacement_too_long", limit: MAX_REPLACEMENT_LENGTH };
    }

    return null;
}

function buildOutput(request: RegexAnalysisRequest, matches: RegexAnalysis["matches"]): string {
    if (request.mode === "substitute") {
        return substituteAll(request.testString, matches, request.replacement);
    }

    if (request.mode === "list") {
        return listMatches(request.testString, matches, request.replacement);
    }

    return "";
}

export function analyzeRegex(
    request: RegexAnalysisRequest,
    options: AnalyzeOptions = {},
): RegexAnalysis {
    // A pattern past the ceiling is not parsed at all: the explanation would be
    // unreadable and the highlighter would paint thousands of spans.
    if (request.pattern.length > MAX_PATTERN_LENGTH) {
        return emptyAnalysis({
            failure: { reason: "pattern_too_long", limit: MAX_PATTERN_LENGTH },
        });
    }

    const view = describePattern(request);

    if (request.pattern.length === 0) {
        return withPattern(view, {});
    }

    const blocking = view.diagnostics.find((diagnostic) => diagnostic.severity === "error");

    if (blocking !== undefined) {
        return withPattern(view, {
            failure: {
                reason: "unsupported_construct",
                position: blocking.start + 1,
                detail: blocking.source,
            },
        });
    }

    const engineFlags = toEngineFlags(request.flags);
    const compiled = compilePattern(view.compiledSource, engineFlags);

    if (!compiled.ok) {
        return withPattern(view, {
            failure: { reason: "invalid_pattern", detail: compiled.message },
            compiledSource: view.compiledSource,
            compiledFlags: engineFlags,
        });
    }

    const overLimit = limitFailure(request);

    if (overLimit !== null) {
        return withPattern(view, {
            failure: overLimit,
            compiledSource: view.compiledSource,
            compiledFlags: engineFlags,
        });
    }

    const execution = findMatches(
        compiled.regex,
        request.testString,
        view.groups,
        options.limits ?? DEFAULT_EXECUTION_LIMITS,
        options.clock,
    );

    return withPattern(view, {
        // A run that ran out of budget still reports what it found; dropping
        // those matches would hide the very evidence of what is slow.
        failure: execution.timedOut ? { reason: "timed_out" } : null,
        matches: execution.matches,
        truncated: execution.truncated,
        durationMs: execution.durationMs,
        output: buildOutput(request, execution.matches),
        compiledSource: view.compiledSource,
        compiledFlags: engineFlags,
    });
}
