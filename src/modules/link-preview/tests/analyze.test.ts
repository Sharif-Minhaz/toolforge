import { describe, expect, test } from "bun:test";

import { analyzePreview, type AnalysisInput } from "@/modules/link-preview/domain/analyze";
import { readPreviewTags } from "@/modules/link-preview/domain/tags";
import type { Finding, ImageProbe, PageFacts, PreviewCard } from "@/modules/link-preview/types";

const PAGE_URL = new URL("https://www.example.com/post");

function head(...lines: string[]): string {
    return `<html><head>${lines.join("\n")}</head><body></body></html>`;
}

const COMPLETE = head(
    `<title>Document title</title>`,
    `<meta name="description" content="Meta description">`,
    `<meta property="og:title" content="OG title">`,
    `<meta property="og:description" content="OG description">`,
    `<meta property="og:url" content="https://example.com/post">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="Example">`,
    `<meta property="og:image" content="https://cdn.example/cover.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Cover">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="canonical" href="https://example.com/post">`,
);

function probe(overrides: Partial<Extract<ImageProbe, { ok: true }>> = {}): ImageProbe {
    return {
        ok: true,
        url: "https://cdn.example/cover.png",
        type: "image/png",
        bytes: 120_000,
        width: 1200,
        height: 630,
        dataUrl: "data:image/png;base64,AAAA",
        ...overrides,
    };
}

function page(overrides: Partial<PageFacts> = {}): PageFacts {
    return {
        requestedUrl: PAGE_URL.toString(),
        finalUrl: PAGE_URL.toString(),
        status: 200,
        hops: [{ url: PAGE_URL.toString(), status: 200 }],
        contentType: "text/html; charset=utf-8",
        charset: "utf-8",
        headEndsAt: 2_000,
        truncated: false,
        ...overrides,
    };
}

function analyze(html: string, overrides: Partial<AnalysisInput> = {}) {
    return analyzePreview({
        tags: readPreviewTags(html),
        pageUrl: PAGE_URL,
        page: page(),
        images: [probe()],
        ...overrides,
    });
}

function card(cards: readonly PreviewCard[], platform: PreviewCard["platform"]): PreviewCard {
    const found = cards.find((entry) => entry.platform === platform);

    if (found === undefined) {
        throw new Error(`no ${platform} card`);
    }

    return found;
}

function codes(findings: readonly Finding[]): string[] {
    return findings.map((entry) =>
        entry.platform === null ? entry.code : `${entry.code}@${entry.platform}`,
    );
}

describe("a complete, well-formed page", () => {
    const result = analyze(COMPLETE);

    test("draws a large card everywhere a picture is shown", () => {
        for (const platform of [
            "facebook",
            "x",
            "linkedin",
            "whatsapp",
            "slack",
            "discord",
            "telegram",
        ] as const) {
            expect(card(result.cards, platform).layout).toBe("large");
        }

        expect(card(result.cards, "google").layout).toBe("text");
    });

    test("raises no errors or warnings", () => {
        expect(result.findings.filter((entry) => entry.severity !== "info")).toEqual([]);
    });

    test("prints the host without www.", () => {
        expect(card(result.cards, "facebook").host).toBe("example.com");
    });

    test("Google prefers <title>, everybody else og:title", () => {
        expect(card(result.cards, "google").title?.source).toBe("title");
        expect(card(result.cards, "facebook").title?.source).toBe("og:title");
    });
});

describe("fallback chains", () => {
    const bare = head(
        `<title>Only a title</title>`,
        `<meta name="twitter:title" content="Tweet title">`,
    );
    const result = analyze(bare, { images: [] });

    test("X takes twitter:title, Facebook falls to <title>", () => {
        expect(card(result.cards, "x").title?.source).toBe("twitter:title");
        expect(card(result.cards, "facebook").title?.source).toBe("title");
        expect(card(result.cards, "discord").title?.source).toBe("twitter:title");
    });

    test("LinkedIn ignores twitter:* entirely", () => {
        expect(card(result.cards, "linkedin").title?.source).toBe("title");
    });

    test("a missing og:title is an error, a missing og:image too", () => {
        expect(codes(result.findings)).toContain("missing_og_title");
        expect(result.findings.find((entry) => entry.code === "missing_og_image")?.severity).toBe(
            "error",
        );
    });

    test("twitter:image alone is a warning, not an error, because half the platforms still have a picture", () => {
        const withTwitterImage = analyze(
            head(`<meta name="twitter:image" content="https://cdn.example/t.png">`),
            {
                images: [],
            },
        );

        expect(
            withTwitterImage.findings.find((entry) => entry.code === "missing_og_image")?.severity,
        ).toBe("warning");
    });

    test("no title and no picture is no card", () => {
        expect(card(analyze("<html></html>", { images: [] }).cards, "facebook").layout).toBe(
            "none",
        );
    });
});

describe("the picture", () => {
    test("a small picture is refused by Facebook and kept as a thumbnail by LinkedIn", () => {
        const result = analyze(COMPLETE, { images: [probe({ width: 180, height: 180 })] });

        expect(card(result.cards, "facebook").layout).toBe("text");
        expect(card(result.cards, "linkedin").layout).toBe("small");
        expect(codes(result.findings)).toContain("image_too_small@facebook");
        expect(codes(result.findings)).toContain("image_thumbnail_only@linkedin");
    });

    test("700 KB is over WhatsApp's 600 KB and fine on Facebook", () => {
        const result = analyze(COMPLETE, { images: [probe({ bytes: 700 * 1024 })] });

        expect(card(result.cards, "whatsapp").layout).toBe("text");
        expect(card(result.cards, "facebook").layout).toBe("large");
        expect(codes(result.findings)).toContain("image_too_large@whatsapp");
        expect(codes(result.findings)).not.toContain("image_too_large@facebook");
    });

    test("WebP is not in Facebook's documented list but is in Discord's", () => {
        const result = analyze(COMPLETE, { images: [probe({ type: "image/webp" })] });

        expect(codes(result.findings)).toContain("image_format_undocumented@facebook");
        expect(
            result.findings.find((entry) => entry.code === "image_format_undocumented")?.severity,
        ).toBe("warning");
        // Facebook renders WebP in practice, so the card keeps the picture.
        expect(card(result.cards, "facebook").layout).toBe("large");
        expect(codes(result.findings)).not.toContain("image_format_undocumented@discord");
    });

    test("wider than 4:1 is refused by WhatsApp", () => {
        const result = analyze(COMPLETE, { images: [probe({ width: 2000, height: 400 })] });

        expect(codes(result.findings)).toContain("image_aspect_extreme@whatsapp");
    });

    test("a failed fetch is one error, not one per platform", () => {
        const result = analyze(COMPLETE, {
            images: [{ ok: false, url: "https://cdn.example/cover.png", reason: "timed_out" }],
        });
        const failures = result.findings.filter((entry) => entry.code === "image_fetch_failed");

        expect(failures).toHaveLength(1);
        expect(failures[0].values.reason).toBe("timed_out");
        expect(card(result.cards, "facebook").layout).toBe("text");
    });

    test("declared and measured sizes that disagree are a warning", () => {
        const result = analyze(COMPLETE, { images: [probe({ width: 800, height: 418 })] });

        expect(codes(result.findings)).toContain("image_dimensions_mismatch");
    });

    test("an unmeasured picture uses the declared size and says it was not measured", () => {
        const result = analyze(COMPLETE, { images: [] });

        expect(card(result.cards, "facebook").image?.width).toBe(1200);
        expect(codes(result.findings)).toContain("image_unmeasured");
    });

    test("a relative og:image is resolved for the card and still reported", () => {
        const result = analyze(
            head(
                `<meta property="og:title" content="t">`,
                `<meta property="og:image" content="/c.png">`,
            ),
            {
                images: [],
            },
        );

        expect(card(result.cards, "facebook").image?.url).toBe("https://www.example.com/c.png");
        expect(codes(result.findings)).toContain("relative_image");
    });
});

describe("card types", () => {
    test("without summary_large_image, X, Slack, Discord and Telegram draw the small card", () => {
        const result = analyze(COMPLETE.replace("summary_large_image", "summary"));

        for (const platform of ["x", "slack", "discord", "telegram"] as const) {
            expect(card(result.cards, platform).layout).toBe("small");
        }

        expect(card(result.cards, "facebook").layout).toBe("large");
        // Asked for the small card, so no size finding.
        expect(codes(result.findings)).not.toContain("image_thumbnail_only@x");
    });

    test("summary_large_image with a picture under 300 × 157 drops X to the small card, and says why", () => {
        const result = analyze(COMPLETE, { images: [probe({ width: 280, height: 150 })] });

        expect(card(result.cards, "x").layout).toBe("small");
        expect(codes(result.findings)).toContain("image_thumbnail_only@x");
    });

    test("an unknown card type is a warning", () => {
        const result = analyze(COMPLETE.replace("summary_large_image", "gallery"));

        expect(codes(result.findings)).toContain("invalid_twitter_card@x");
    });
});

describe("text limits", () => {
    test("Discord counts bytes: a Bangla title that fits X is cut on Discord", () => {
        const bangla = "বাংলা ".repeat(8).trim();
        const result = analyze(
            COMPLETE.replace("OG title", bangla).replace("summary_large_image", "summary"),
        );

        expect(card(result.cards, "discord").title?.clipped).toBe(true);
        expect(card(result.cards, "x").title?.clipped).toBe(false);

        const discord = result.findings.find((entry) => entry.code === "title_too_long");

        expect(discord?.platform).toBe("discord");
        expect(discord?.values.unit).toBe("bytes");
    });

    test("the full text is kept beside the clipped one", () => {
        const long = "x".repeat(90);
        const x = card(analyze(COMPLETE.replace("OG title", long)).cards, "x");

        expect(x.title?.full).toBe(long);
        expect(x.title?.text.endsWith("…")).toBe(true);
    });
});

describe("tag hygiene", () => {
    test("duplicates, keys on name=, and og:url versus canonical", () => {
        const result = analyze(
            head(
                `<meta property="og:title" content="a">`,
                `<meta property="og:title" content="b">`,
                `<meta name="og:description" content="d">`,
                `<meta property="og:url" content="https://example.com/other">`,
                `<link rel="canonical" href="https://example.com/post">`,
            ),
            { images: [] },
        );

        expect(codes(result.findings)).toEqual(
            expect.arrayContaining([
                "duplicate_tag",
                "og_on_name_attribute",
                "og_url_differs_from_canonical",
            ]),
        );
        expect(result.findings.find((entry) => entry.code === "duplicate_tag")?.values).toEqual({
            key: "og:title",
            count: 2,
        });
    });

    test("Discord takes the last theme-color and refuses a short hex", () => {
        const result = analyze(
            head(
                `<meta property="og:title" content="t">`,
                `<meta name="theme-color" content="#112233">`,
                `<meta name="theme-color" content="#abc">`,
            ),
            { images: [] },
        );

        expect(card(result.cards, "discord").accent).toBeNull();
        expect(codes(result.findings)).toContain("invalid_theme_color@discord");
    });

    test("Slack carries the label rows; nobody else does", () => {
        const result = analyze(
            COMPLETE.replace(
                "</head>",
                `<meta name="twitter:label1" content="Price"><meta name="twitter:data1" content="$5"></head>`,
            ),
        );

        expect(card(result.cards, "slack").labels).toEqual([{ label: "Price", data: "$5" }]);
        expect(card(result.cards, "discord").labels).toEqual([]);
    });
});

describe("the page itself", () => {
    test("a 404 and a non-HTML response are errors", () => {
        const result = analyze(COMPLETE, {
            page: page({ status: 404, contentType: "application/json" }),
        });

        expect(codes(result.findings)).toEqual(expect.arrayContaining(["page_status", "not_html"]));
    });

    test("a head ending past 300 KB is past WhatsApp's limit and inside Facebook's", () => {
        const result = analyze(COMPLETE, { page: page({ headEndsAt: 400 * 1024 }) });

        expect(codes(result.findings)).toContain("head_beyond_limit@whatsapp");
        expect(codes(result.findings)).not.toContain("head_beyond_limit@facebook");
    });

    test("pasted markup has no page facts and no page findings", () => {
        const result = analyze(COMPLETE, { page: null });

        expect(codes(result.findings).some((code) => code.startsWith("page_status"))).toBe(false);
    });

    test("errors come first, then warnings, then notes", () => {
        const result = analyze("<html><head></head></html>", { images: [] });
        const ranks = result.findings.map(
            (entry) => ({ error: 0, warning: 1, info: 2 })[entry.severity],
        );

        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });
});
