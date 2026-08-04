import { parse } from "@formatjs/icu-messageformat-parser";
import { describe, expect, test } from "bun:test";

import bn from "@/messages/bn.json";
import en from "@/messages/en.json";

/**
 * Every message is ICU MessageFormat, whether or not it has an argument in it.
 *
 * That is easy to forget, because most copy parses as ICU by accident. The
 * characters that do not are the ones a developer tool's copy is full of: `{`
 * and `}` open and close an argument, so a JSON sample or a `\p{L}` escape is a
 * syntax error, and `<name>` opens a rich-text tag, so an HTML element or a
 * regex group name is an unclosed one. next-intl does not throw on these — it
 * reports an `INVALID_MESSAGE` error and renders the key path in place of the
 * words, which is a defect nothing else in the pipeline notices.
 *
 * The parser here is the one `intl-messageformat` itself uses, pinned to the
 * version next-intl resolves, so this asks the real question rather than an
 * approximation of it.
 *
 * A literal brace is escaped by wrapping it in apostrophes — `'{'` — and a
 * literal `<` by the same means. Where the value is a code sample rather than
 * copy, the better fix is to move it out of the catalogue entirely: see
 * `INPUT_PLACEHOLDERS` in `src/modules/bson/domain/constants.ts`.
 */

/**
 * Messages that were already malformed when this test was written. They are
 * genuine defects — each renders as its own key today — and they are quarantined
 * rather than fixed here only because repairing four unrelated tools' copy
 * belongs in its own change. Shorten this list; never add to it.
 */
const KNOWN_MALFORMED: ReadonlySet<string> = new Set([
    // `{` from a `\p{…}` escape or a `\d{4}` quantifier.
    "markdown.sample.document",
    "regex.workbench.flags.unicode.hint",
    "regex.article.flags.unicodeDoes",
    // `<` from an HTML element or a named capture group.
    "markdown.article.safety.p1",
    "regex.article.syntax.groupsExample",
    "regex.article.modes.token_named",
    "imageConverter.workbench.snippetDescription",
]);

type MessageTree = { [key: string]: string | MessageTree };

function flatten(tree: MessageTree, prefix = ""): readonly (readonly [string, string])[] {
    return Object.entries(tree).flatMap(([key, value]) =>
        typeof value === "string"
            ? [[prefix + key, value] as const]
            : flatten(value, `${prefix}${key}.`),
    );
}

const CATALOGUES = [
    ["en", en as MessageTree],
    ["bn", bn as MessageTree],
] as const;

describe("message catalogues parse as ICU MessageFormat", () => {
    for (const [locale, catalogue] of CATALOGUES) {
        test(`${locale}.json has no malformed message`, () => {
            const broken: string[] = [];

            for (const [key, value] of flatten(catalogue)) {
                if (KNOWN_MALFORMED.has(key)) {
                    continue;
                }

                try {
                    parse(value);
                } catch (caught) {
                    broken.push(`${key}: ${caught instanceof Error ? caught.message : "unknown"}`);
                }
            }

            expect(broken).toEqual([]);
        });

        test(`${locale}.json still contains every quarantined key`, () => {
            // Guards the list against rot: a key that was renamed or repaired
            // has to leave this set, or it silently stops meaning anything.
            const keys = new Set(flatten(catalogue).map(([key]) => key));

            expect([...KNOWN_MALFORMED].filter((key) => !keys.has(key))).toEqual([]);
        });
    }

    test("every quarantined message really is malformed, in both locales", () => {
        for (const [locale, catalogue] of CATALOGUES) {
            const values = new Map(flatten(catalogue));

            for (const key of KNOWN_MALFORMED) {
                expect(() => parse(values.get(key) ?? "")).toThrow();
            }

            expect(locale).toBeTruthy();
        }
    });
});
