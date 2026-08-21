import TurndownService from "turndown";
import { gfm } from "@joplin/turndown-plugin-gfm";

import type { HtmlMarkdownOptions } from "../types";
import {
    BULLET_CHARACTERS,
    EMPHASIS_CHARACTERS,
    PRESERVED_ELEMENTS,
    STRIPPED_ELEMENTS,
    STRIPPED_METADATA_ELEMENTS,
} from "./constants";

/**
 * HTML in, Markdown out, through Turndown.
 *
 * Depended on rather than written, for the reason in decision tree 45: what
 * comes out of here is read by GitHub, by a static-site generator, by whatever
 * the reader pastes it into. A hand-rolled walker would be a second answer to a
 * question that already has a settled one, and every edge case it got wrong —
 * a `<pre>` holding a `<code>` holding entities, a list nested inside a table
 * cell — would be ours to discover in somebody's README.
 *
 * The service is built per call. It is a cheap object over a rules array, and
 * the alternative is a cached instance whose options have to be reconciled with
 * the ones just asked for — module-level mutable state, which is exactly the
 * shape that produced the flaky UUID test.
 */

/** What a `<script>` or `<style>` looks like once its content is thrown away. */
export type MarkdownConversion = {
    readonly markdown: string;
    /** Reportable elements dropped, deduplicated and in document order. */
    readonly removed: readonly string[];
};

const STRIPPED = new Set<string>(STRIPPED_ELEMENTS);

const STRIPPED_METADATA = new Set<string>(STRIPPED_METADATA_ELEMENTS);

function toTurndownOptions(options: HtmlMarkdownOptions): TurndownService.Options {
    return {
        headingStyle: options.headingStyle,
        bulletListMarker: BULLET_CHARACTERS[options.bulletMarker],
        codeBlockStyle: options.codeBlockStyle,
        emDelimiter: EMPHASIS_CHARACTERS[options.emphasisStyle],
        // Always `**`. The other spelling is `__`, which collides with the
        // emphasis delimiter when that is set to `_`, and `___word___` is a
        // different token again — one control cannot be allowed to change what
        // another one's output means.
        strongDelimiter: "**",
        linkStyle: options.linkStyle,
        linkReferenceStyle: "full",
        fence: "```",
        hr: "---",
    };
}

export function htmlToMarkdown(
    html: string,
    options: HtmlMarkdownOptions,
): MarkdownConversion | null {
    const removed: string[] = [];
    const service = new TurndownService(toTurndownOptions(options));

    if (options.gfm) {
        service.use(gfm);
    }

    if (options.keepUnsupportedHtml) {
        service.keep([...PRESERVED_ELEMENTS]);
    }

    // A filter function rather than a tag list, so the same pass that drops the
    // element records that it did. Turndown consults removal rules only after
    // its own, and it owns none of these tags, so nothing shadows this.
    service.remove((node) => {
        const name = node.nodeName.toLowerCase();

        if (STRIPPED.has(name)) {
            if (!removed.includes(name)) {
                removed.push(name);
            }

            return true;
        }

        return STRIPPED_METADATA.has(name);
    });

    try {
        return { markdown: service.turndown(html), removed };
    } catch {
        // Turndown throws on a non-string input and on a DOM it cannot build.
        // Neither is something a reader can fix by reading an engine's message,
        // so the caller gets a named refusal instead of an exception.
        return null;
    }
}
