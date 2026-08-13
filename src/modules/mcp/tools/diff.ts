import { z } from "zod";

import { compareTexts } from "@/modules/diff/domain/compare";
import {
    COLLAPSE_CONTEXT_LINES,
    DEFAULT_DIFF_PRECISION,
    MAX_DIFF_INPUT_LENGTH,
    PATCH_LEFT_LABEL,
    PATCH_RIGHT_LABEL,
} from "@/modules/diff/domain/constants";
import { buildUnifiedPatch } from "@/modules/diff/domain/export";
import { DIFF_PRECISIONS } from "@/modules/diff/types";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * A comparison, returned as a unified patch rather than as rows.
 *
 * The page renders a row per line because it has a screen. A tool result has a
 * context window, and a row array for two thousand-line documents would fill it
 * with the ninety per cent that did not change. A unified diff is the format
 * that already solved this — every reviewer, `git apply` and `patch(1)` read
 * it — so the answer is both smaller and more useful than our own structure.
 *
 * The statistics come back beside it, because "what changed" and "how much
 * changed" are different questions and the second one should not require
 * counting the first.
 */
export const diffCompareTool = defineMcpTool({
    toolId: "diff",
    verb: "compare",
    title: "Compare two texts",
    description:
        "Compare two texts and return a unified diff plus counts of added, removed and changed lines. Can ignore case and whitespace when deciding whether two lines match. Returns an empty patch when the two sides are identical under the active options — which is not the same as being byte-identical, and `identical` says which.",
    kind: "offline",
    inputSchema: z.object({
        left: z.string().max(MAX_DIFF_INPUT_LENGTH).describe("The original text"),
        right: z.string().max(MAX_DIFF_INPUT_LENGTH).describe("The changed text"),
        precision: z
            .enum(DIFF_PRECISIONS)
            .default(DEFAULT_DIFF_PRECISION)
            .describe("How finely a changed line is broken down internally"),
        ignoreCase: z.boolean().default(false),
        ignoreWhitespace: z
            .boolean()
            .default(false)
            .describe("Collapse whitespace runs and trim the ends before comparing"),
        context: z
            .number()
            .int()
            .min(0)
            .max(20)
            .default(COLLAPSE_CONTEXT_LINES)
            .describe("Unchanged lines to keep around each hunk"),
        leftLabel: z.string().max(200).default(PATCH_LEFT_LABEL),
        rightLabel: z.string().max(200).default(PATCH_RIGHT_LABEL),
    }),
    run: ({ left, right, context, leftLabel, rightLabel, ...options }) => {
        const result = compareTexts(left, right, options);

        if (!result.ok) {
            return refuseWithReason("Diff", result.reason);
        }

        const patch = buildUnifiedPatch(
            result.rows,
            { left: leftLabel, right: rightLabel },
            context,
        );

        return succeed(
            result.identical
                ? "No differences under the active options"
                : `+${result.stats.added} −${result.stats.removed} ~${result.stats.changed}`,
            {
                patch,
                identical: result.identical,
                stats: { ...result.stats },
            },
        );
    },
});
