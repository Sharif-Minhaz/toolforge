import { z } from "zod";

import { analyzeRegex } from "@/modules/regex/domain/analyze";
import {
    MAX_MATCHES,
    MAX_PATTERN_LENGTH,
    MAX_REPLACEMENT_LENGTH,
    MAX_TEST_STRING_LENGTH,
} from "@/modules/regex/domain/constants";
import { parseFlagLetters } from "@/modules/regex/domain/flags";
import { REGEX_MODES } from "@/modules/regex/types";

import { defineMcpTool } from "../domain/define-tool";
import { refuse, succeed } from "../domain/result";

/**
 * Matching, substitution and listing, plus the thing a caller cannot do for
 * itself: find out *why* a pattern will not compile.
 *
 * Flags arrive as letters rather than as the internal union, because `"gi"` is
 * how a regex is written everywhere else and asking for `["global",
 * "ignoreCase"]` would be this tool inventing a dialect.
 *
 * The engine's own message is passed through in `detail` on a compile failure.
 * That is a deliberate exception to the rule against surfacing engine text: a
 * caller debugging a pattern needs `Invalid regular expression: missing )`, and
 * the string describes the argument rather than the host running it.
 */
export const regexTestTool = defineMcpTool({
    toolId: "regex",
    verb: "test",
    title: "Test a regular expression",
    description:
        "Run a JavaScript regular expression against a test string and return every match with its position and capture groups. `substitute` mode applies a replacement (with `$1`, `$<name>` and `$&`), `list` mode returns just the matched text. Reports why a pattern failed to compile, and warns about nested quantifiers that risk catastrophic backtracking.",
    kind: "offline",
    inputSchema: z.object({
        pattern: z.string().max(MAX_PATTERN_LENGTH).describe("The pattern, without delimiters"),
        testString: z.string().max(MAX_TEST_STRING_LENGTH).describe("The text to run it against"),
        flags: z
            .string()
            .max(16)
            .default("gm")
            .describe("Flag letters as written in a literal, e.g. `gi`, `gms`"),
        mode: z.enum(REGEX_MODES).default("match"),
        replacement: z
            .string()
            .max(MAX_REPLACEMENT_LENGTH)
            .default("")
            .describe("Used by `substitute` and `list`; supports `$1` and `$<name>`"),
    }),
    run: ({ pattern, testString, flags, mode, replacement }) => {
        const analysis = analyzeRegex({
            pattern,
            flags: parseFlagLetters(flags),
            mode,
            replacement,
            testString,
        });

        if (analysis.failure !== null) {
            const { reason, position, detail, limit } = analysis.failure;

            return refuse(reason, `Pattern rejected: ${reason.replaceAll("_", " ")}.`, {
                reason,
                position: position ?? null,
                detail: detail ?? null,
                limit: limit ?? null,
            });
        }

        return succeed(
            `${analysis.matches.length}${analysis.truncated ? "+" : ""} match${
                analysis.matches.length === 1 ? "" : "es"
            }`,
            {
                matches: analysis.matches.map((match) => ({
                    start: match.start,
                    end: match.end,
                    value: match.value,
                    captures: match.captures.map((capture) => ({
                        index: capture.index,
                        name: capture.name,
                        value: capture.value,
                        start: capture.start,
                        end: capture.end,
                    })),
                })),
                output: analysis.output,
                groups: analysis.groups.map((group) => ({ ...group })),
                compiledSource: analysis.compiledSource,
                compiledFlags: analysis.compiledFlags,
                // True when the cap bit. A model that reports "12 matches"
                // when there were three thousand has been misled by us.
                truncated: analysis.truncated,
                matchCap: MAX_MATCHES,
                diagnostics: analysis.diagnostics.map((diagnostic) => ({
                    code: diagnostic.code,
                    severity: diagnostic.severity,
                    start: diagnostic.start,
                    end: diagnostic.end,
                })),
            },
        );
    },
});
