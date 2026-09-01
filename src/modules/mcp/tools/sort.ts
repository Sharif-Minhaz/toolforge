import { z } from "zod";

import { DEFAULT_SORT_OPTIONS, usesSortKey } from "@/modules/sort/domain/constants";
import { drawShuffleSeed } from "@/modules/sort/domain/shuffle";
import { sortLines } from "@/modules/sort/domain/sort-lines";
import {
    bulletStyleSchema,
    listFormatSchema,
    numberStyleSchema,
    sortKeySchema,
    sortOrderSchema,
    sortTextSchema,
    splitModeSchema,
    startNumberSchema,
} from "@/modules/sort/validation/sort-options";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

export const sortLinesTool = defineMcpTool({
    toolId: "sort",
    verb: "lines",
    title: "Sort and list lines",
    description:
        "Sort pasted lines and write them back as plain text, a bulleted list or a numbered one. Orders: as typed, ascending, descending, reverse, shuffle — with alphabetical, natural (item2 before item10), raw code-point or length as the comparison. Cleans up as it goes: trims, drops blank lines, removes duplicates, and strips a bullet or ordinal the lines already carry. Its smart line detection folds hard-wrapped text back into whole items, so a paragraph copied out of a PDF becomes one item rather than nine.",
    kind: "offline",
    inputSchema: z.object({
        text: sortTextSchema.describe("The lines to sort, one per line"),
        splitMode: splitModeSchema
            .default(DEFAULT_SORT_OPTIONS.splitMode)
            .describe(
                "Where an item ends. 'line' starts one at every newline; 'smart' folds a hard-wrapped line into the one above it; 'paragraph' ends an item only at a blank line",
            ),
        order: sortOrderSchema
            .default(DEFAULT_SORT_OPTIONS.order)
            .describe("What happens to the order of the items"),
        sortKey: sortKeySchema
            .default(DEFAULT_SORT_OPTIONS.sortKey)
            .describe(
                "What 'smaller' means. Read only by 'ascending' and 'descending'; ignored by the three orders that compare nothing",
            ),
        caseSensitive: z
            .boolean()
            .default(DEFAULT_SORT_OPTIONS.caseSensitive)
            .describe(
                "Treat A and a as different characters, when comparing and when spotting a duplicate. Ignored by the 'codepoint' key, which is raw by definition",
            ),
        trim: z
            .boolean()
            .default(DEFAULT_SORT_OPTIONS.trim)
            .describe("Take the whitespace off both ends of every item"),
        removeEmpty: z
            .boolean()
            .default(DEFAULT_SORT_OPTIONS.removeEmpty)
            .describe("Drop items that hold nothing but whitespace"),
        removeDuplicates: z
            .boolean()
            .default(DEFAULT_SORT_OPTIONS.removeDuplicates)
            .describe("Keep the first of each repeated item and drop every later copy"),
        stripMarkers: z
            .boolean()
            .default(DEFAULT_SORT_OPTIONS.stripMarkers)
            .describe(
                "Take off a bullet or an ordinal an item already carries, so re-listing gives one marker rather than two",
            ),
        format: listFormatSchema
            .default(DEFAULT_SORT_OPTIONS.format)
            .describe("How the finished items are written back"),
        bulletStyle: bulletStyleSchema
            .default(DEFAULT_SORT_OPTIONS.bulletStyle)
            .describe("Which bullet to write. Read only when format is 'bullet'"),
        numberStyle: numberStyleSchema
            .default(DEFAULT_SORT_OPTIONS.numberStyle)
            .describe("Which ordinal to write. Read only when format is 'numbered'"),
        startNumber: startNumberSchema
            .default(DEFAULT_SORT_OPTIONS.startNumber)
            .describe("First ordinal of a numbered list. Read only when format is 'numbered'"),
    }),
    run: ({ text, ...options }) => {
        // The one argument a caller cannot supply: a shuffle needs randomness,
        // and an MCP call has no first paint to keep in step with. Drawn here
        // and reported back, so a caller that wants the same arrangement twice
        // can see it is not going to get one.
        const seed = drawShuffleSeed(cryptoRandomBytes);
        const result = sortLines(text, options, seed);

        if (!result.ok) {
            return refuseWithReason("Text sorter", result.reason, { order: options.order });
        }

        return succeed(result.text, {
            text: result.text,
            items: [...result.items],
            order: options.order,
            // An MCP caller has no greyed-out control to look at, so the two
            // arguments that can be silently inert say so in the answer.
            sortKeyApplied: usesSortKey(options.order) ? options.sortKey : null,
            shuffleSeed: options.order === "shuffle" ? seed : null,
            lines: result.counts.lines,
            splitInto: result.counts.split,
            joined: result.counts.joined,
            wrapWidth: result.counts.wrapWidth,
            blanksRemoved: result.counts.blanksRemoved,
            duplicatesRemoved: result.counts.duplicatesRemoved,
            itemCount: result.counts.items,
            unchanged: result.unchanged,
        });
    },
});
