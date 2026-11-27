import { describe, expect, test } from "bun:test";

import { buildRecommendedHead } from "@/modules/link-preview/domain/snippet";
import { readPreviewTags } from "@/modules/link-preview/domain/tags";

const PLACEHOLDERS = {
    title: "TITLE",
    description: "DESCRIPTION",
    image: "https://example.com/IMAGE.png",
    imageAlt: "ALT",
};

describe("buildRecommendedHead", () => {
    test("fills the gaps from what the page has and from the measurement", () => {
        const html = `<head><title>Doc</title><meta property="og:image" content="/c.png"></head>`;
        const snippet = buildRecommendedHead({
            tags: readPreviewTags(html),
            pageUrl: new URL("https://example.com/post"),
            images: [
                {
                    ok: true,
                    url: "https://example.com/c.png",
                    type: "image/png",
                    bytes: 10,
                    width: 1200,
                    height: 630,
                    dataUrl: "data:,",
                },
            ],
            placeholders: PLACEHOLDERS,
        });

        expect(snippet).toContain(`<meta property="og:title" content="Doc">`);
        expect(snippet).toContain(`<meta property="og:image" content="https://example.com/c.png">`);
        expect(snippet).toContain(`<meta property="og:image:width" content="1200">`);
        expect(snippet).toContain(`<meta property="og:url" content="https://example.com/post">`);
        expect(snippet).toContain(`<meta name="twitter:card" content="summary_large_image">`);
        expect(snippet).toContain(`content="DESCRIPTION"`);
        expect(snippet).toContain(`content="ALT"`);
    });

    test("escapes a quote in the page's own copy", () => {
        const snippet = buildRecommendedHead({
            tags: readPreviewTags(`<meta property="og:title" content="Say &quot;hi&quot; <now>">`),
            pageUrl: null,
            images: [],
            placeholders: PLACEHOLDERS,
        });

        expect(snippet).toContain(`content="Say &quot;hi&quot; &lt;now&gt;"`);
        expect(snippet).toContain(`content="https://example.com/IMAGE.png"`);
        expect(snippet).not.toContain("og:url");
    });

    test("keeps twitter:* only where it differs from Open Graph", () => {
        const snippet = buildRecommendedHead({
            tags: readPreviewTags(
                `<meta property="og:title" content="Same"><meta property="og:description" content="Open"><meta name="twitter:title" content="Same"><meta name="twitter:description" content="Other">`,
            ),
            pageUrl: null,
            images: [],
            placeholders: PLACEHOLDERS,
        });

        expect(snippet).not.toContain(`twitter:title`);
        expect(snippet).toContain(`<meta name="twitter:description" content="Other">`);
    });

    test("the snippet reads back as the tags it claims", () => {
        const snippet = buildRecommendedHead({
            tags: readPreviewTags(`<meta property="og:title" content="A &amp; B">`),
            pageUrl: new URL("https://example.com/"),
            images: [],
            placeholders: PLACEHOLDERS,
        });
        const reread = readPreviewTags(snippet);

        expect(reread.og.title).toBe("A & B");
        expect(reread.og.url).toBe("https://example.com/");
        expect(reread.twitter.card).toBe("summary_large_image");
    });
});
