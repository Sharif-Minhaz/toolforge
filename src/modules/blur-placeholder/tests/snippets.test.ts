import { describe, expect, test } from "bun:test";

import { buildSnippet, SNIPPET_KINDS } from "@/modules/blur-placeholder/domain/snippets";
import type { SnippetInput } from "@/modules/blur-placeholder/domain/snippets";

const INPUT: SnippetInput = {
    placeholder: {
        hash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
        componentX: 4,
        componentY: 3,
        dataUri: "data:image/png;base64,iVBORw0KGgo=",
        dataUriBytes: 35,
        width: 32,
        height: 18,
    },
    punch: 1.5,
    sourceWidth: 1600,
    sourceHeight: 900,
    filename: "/hero.jpg",
};

describe("buildSnippet", () => {
    test("every kind produces something to paste", () => {
        for (const kind of SNIPPET_KINDS) {
            expect(buildSnippet(kind, INPUT).length).toBeGreaterThan(0);
        }
    });

    test("the Next.js snippet carries the data URI, not the hash", () => {
        // `next/image` never sees a BlurHash — it reads `blurDataURL` and
        // nothing else, which is the whole reason this tool writes a PNG too.
        const snippet = buildSnippet("next", INPUT);

        expect(snippet).toContain('placeholder="blur"');
        expect(snippet).toContain(`blurDataURL="${INPUT.placeholder.dataUri}"`);
        expect(snippet).not.toContain(INPUT.placeholder.hash);
    });

    test("the Next.js snippet sizes the element from the real picture", () => {
        const snippet = buildSnippet("next", INPUT);

        expect(snippet).toContain("width={1600}");
        expect(snippet).toContain("height={900}");
    });

    test("the react-blurhash snippet carries the hash, not the data URI", () => {
        const snippet = buildSnippet("react", INPUT);

        expect(snippet).toContain(`hash="${INPUT.placeholder.hash}"`);
        expect(snippet).not.toContain("data:image/png");
    });

    test("the react-blurhash snippet passes the punch it was decoded at", () => {
        expect(buildSnippet("react", INPUT)).toContain("punch={1.5}");
    });

    test("the react-blurhash snippet resolves at the placeholder's size", () => {
        const snippet = buildSnippet("react", INPUT);

        expect(snippet).toContain("resolutionX={32}");
        expect(snippet).toContain("resolutionY={18}");
    });

    test("the CSS snippet covers rather than stretches", () => {
        const snippet = buildSnippet("css", INPUT);

        expect(snippet).toContain(`url("${INPUT.placeholder.dataUri}")`);
        expect(snippet).toContain("background-size: cover;");
        expect(snippet).not.toContain("100% 100%");
    });
});
