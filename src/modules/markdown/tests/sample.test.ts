import { describe, expect, test } from "bun:test";

import bn from "@/messages/bn.json";
import en from "@/messages/en.json";
import { parseMarkdown } from "@/modules/markdown/domain/parse";
import { describeDocument } from "@/modules/markdown/domain/statistics";
import type { MarkdownBlock } from "@/modules/markdown/types";

/**
 * The starter document is localised copy, so it can drift the way any other
 * message can. It is also the first thing a visitor sees, and it exists to
 * demonstrate the feature set — a Bangla translation that quietly dropped the
 * mermaid fence would leave half the tool undiscovered.
 */
const SAMPLES = [
    { locale: "en", document: en.markdown.sample.document },
    { locale: "bn", document: bn.markdown.sample.document },
] as const;

function flatten(blocks: readonly MarkdownBlock[]): MarkdownBlock[] {
    return blocks.flatMap((block) => {
        switch (block.kind) {
            case "blockquote":
                return [block, ...flatten(block.children)];
            case "list":
                return [block, ...block.items.flatMap((item) => flatten(item.children))];
            default:
                return [block];
        }
    });
}

function parse(source: string): MarkdownBlock[] {
    const result = parseMarkdown(source);

    if (!result.ok) {
        throw new Error(`sample document failed to parse: ${result.reason}`);
    }

    return flatten(result.document.blocks);
}

describe("sample document", () => {
    for (const { locale, document } of SAMPLES) {
        describe(locale, () => {
            const blocks = parse(document);
            const kinds = new Set(blocks.map((block) => block.kind));

            test("demonstrates every block the preview can render", () => {
                for (const kind of [
                    "heading",
                    "paragraph",
                    "list",
                    "blockquote",
                    "code",
                    "diagram",
                    "table",
                    "mathBlock",
                    "rule",
                ] as const) {
                    expect(kinds).toContain(kind);
                }
            });

            test("shows a task list, which is easy to lose in translation", () => {
                const lists = blocks.filter((block) => block.kind === "list");
                const checks = lists.flatMap((list) => list.items.map((item) => item.checked));

                expect(checks).toContain(true);
                expect(checks).toContain(false);
            });

            test("shows both a note and a warning callout", () => {
                const alerts = blocks
                    .filter((block) => block.kind === "blockquote")
                    .map((block) => block.alert);

                expect(alerts).toContain("note");
                expect(alerts).toContain("warning");
                // A plain quote too, so the difference is visible.
                expect(alerts).toContain(null);
            });

            test("keeps the mermaid fences intact", () => {
                const diagrams = blocks.filter((block) => block.kind === "diagram");

                expect(diagrams.length).toBeGreaterThanOrEqual(2);
                expect(diagrams[0].source).toContain("flowchart");
            });

            test("renders no raw HTML, which the preview would print as text", () => {
                expect(kinds).not.toContain("rawHtml");
            });

            test("is long enough to scroll but short enough to skim", () => {
                const statistics = describeDocument(document);

                // Long enough that scroll linking has something to link, short
                // enough that it reads as an example rather than an article.
                expect(statistics.lines).toBeGreaterThan(40);
                expect(statistics.readingMinutes).toBeLessThanOrEqual(3);
            });
        });
    }
});
