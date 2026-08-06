import { getByteLength } from "@/modules/tools/domain/byte-size";
import type {
    JsonAdvisory,
    JsonError,
    JsonPosition,
    JsonRepair,
} from "@/modules/tools/types/json-tree";

import type { JsonFormatOptions, JsonMode, JsonStats } from "../types";
import { analyzeJson } from "./analyze";
import { INDENT_UNITS, MAX_JSON_INPUT_BYTES } from "./constants";
import { parseJson } from "@/modules/tools/domain/json-parser";
import { serializeJson } from "@/modules/tools/domain/json-serialize";
import { rejectsUnpairedSurrogates, requiresContainerRoot } from "./spec";

export type JsonFormatRequest = {
    readonly mode: JsonMode;
    readonly input: string;
    readonly options: JsonFormatOptions;
};

export type JsonFormatSuccess = {
    readonly ok: true;
    /** Empty while validating — that mode reports rather than rewrites. */
    readonly output: string;
    readonly stats: JsonStats;
    readonly advisories: readonly JsonAdvisory[];
    readonly repairs: readonly JsonRepair[];
    readonly inputBytes: number;
    readonly outputBytes: number;
};

export type JsonFormatFailure = {
    readonly ok: false;
    readonly error: JsonError;
    readonly inputBytes: number;
};

export type JsonFormatResult = JsonFormatSuccess | JsonFormatFailure;

export type JsonSizeDelta = {
    readonly direction: "smaller" | "larger" | "same";
    /** Whole percent, always positive; the direction carries the sign. */
    readonly percent: number;
};

/**
 * How much the output saved or cost, for the line under the result. Rounds to
 * whole percent and calls anything that rounds to nothing "same", so a document
 * that shed three bytes does not claim a saving.
 */
export function describeSizeDelta(inputBytes: number, outputBytes: number): JsonSizeDelta {
    if (inputBytes === 0) {
        return { direction: "same", percent: 0 };
    }

    const percent = Math.round((Math.abs(outputBytes - inputBytes) / inputBytes) * 100);

    if (percent === 0) {
        return { direction: "same", percent: 0 };
    }

    return { direction: outputBytes < inputBytes ? "smaller" : "larger", percent };
}

/** Failures about the document as a whole point at its first character. */
const START: JsonPosition = { line: 1, column: 1, offset: 0 };

/**
 * The one operation the whole tool runs, shared by the server-rendered first
 * paint and every settled keystroke afterwards. Pure and deterministic: the
 * same request always produces the same result, on the server and in the
 * browser alike.
 */
export function formatJson(request: JsonFormatRequest): JsonFormatResult {
    const { mode, input, options } = request;
    const inputBytes = getByteLength(input);

    if (input.trim().length === 0) {
        return { ok: false, inputBytes, error: { code: "empty", ...START } };
    }

    if (inputBytes > MAX_JSON_INPUT_BYTES) {
        return { ok: false, inputBytes, error: { code: "too_large", ...START } };
    }

    const parsed = parseJson(input, options.repair);

    if (!parsed.ok) {
        return { ok: false, inputBytes, error: parsed.error };
    }

    const { root, advisories, repairs } = parsed;

    if (requiresContainerRoot(options.spec) && root.kind !== "object" && root.kind !== "array") {
        return { ok: false, inputBytes, error: { code: "root_not_container", ...root.at } };
    }

    if (rejectsUnpairedSurrogates(options.spec)) {
        const lone = advisories.find((advisory) => advisory.code === "unpaired_surrogate");

        if (lone !== undefined) {
            return {
                ok: false,
                inputBytes,
                error: {
                    code: "unpaired_surrogate",
                    line: lone.line,
                    column: lone.column,
                    offset: lone.offset,
                },
            };
        }
    }

    const output =
        mode === "validate"
            ? ""
            : serializeJson(root, {
                  indent: mode === "minify" ? "" : INDENT_UNITS[options.indent],
                  sortKeys: options.sortKeys,
                  escapeUnicode: options.escapeUnicode,
              });

    return {
        ok: true,
        output,
        stats: analyzeJson(root),
        advisories,
        repairs,
        inputBytes,
        outputBytes: getByteLength(output),
    };
}
