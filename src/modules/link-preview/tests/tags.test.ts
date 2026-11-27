import { describe, expect, test } from "bun:test";

import {
    parseAttributes,
    readHeadTags,
    readOpenGraphImages,
    readPreviewTags,
    sliceHead,
} from "@/modules/link-preview/domain/tags";

const PAGE = `<!doctype html>
<html lang="bn">
<head>
  <meta charset="utf-8">
  <title>  Fallback   title  </title>
  <meta name="description" content="Plain description">
  <meta property="og:title" content="It&rsquo;s a &quot;test&quot; &mdash; ok">
  <meta property="og:description" content="OG description">
  <meta property="og:image" content="/cover.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="A cover">
  <meta property="og:image" content="https://cdn.example/second.jpg">
  <meta property="og:image:width" content="nope">
  <meta property="og:site_name" content="Example">
  <meta name="twitter:card" content="SUMMARY_LARGE_IMAGE">
  <meta name="twitter:image:src" content="https://cdn.example/x.png">
  <meta name="twitter:label1" content="Reading time">
  <meta name="twitter:data1" content="4 min">
  <meta name="twitter:label2" content="Orphan">
  <meta name="theme-color" content="#0a7">
  <link rel="canonical" href="https://example.com/post">
  <link rel="shortcut icon" href="/favicon.png">
  <link rel="alternate" type="application/json+oembed" href="https://example.com/oembed?u=1">
</head>
<body><meta property="og:title" content="Body tag"></body>
</html>`;

describe("parseAttributes", () => {
    test("reads quoted, single-quoted and unquoted values", () => {
        const attributes = parseAttributes(` a="1" b='2' c=3 d`);

        expect(attributes.get("a")).toBe("1");
        expect(attributes.get("b")).toBe("2");
        expect(attributes.get("c")).toBe("3");
        expect(attributes.get("d")).toBe("");
    });

    test("keeps the first of a duplicated attribute, as the HTML parser does", () => {
        expect(parseAttributes(` content="a" content="b"`).get("content")).toBe("a");
    });

    test("does not mistake data-name for name", () => {
        const attributes = parseAttributes(` data-name="x" property="og:title"`);

        expect(attributes.get("name")).toBeUndefined();
        expect(attributes.get("data-name")).toBe("x");
    });

    test("lower-cases names but not values", () => {
        expect(parseAttributes(` PROPERTY="OG:Title"`).get("property")).toBe("OG:Title");
    });
});

describe("sliceHead", () => {
    test("stops at </head>", () => {
        expect(sliceHead("<head><title>a</title></head><body>b</body>")).toBe(
            "<head><title>a</title>",
        );
    });

    test("falls back to <body when there is no closing head", () => {
        expect(sliceHead("<title>a</title><body>b")).toBe("<title>a</title>");
    });

    test("drops comments, scripts and inline SVG titles", () => {
        const head = sliceHead(
            `<!-- <meta property="og:title" content="commented"> -->
             <script>document.write('<meta property="og:title" content="scripted">')</script>
             <svg><title>icon</title></svg>
             <meta property="og:title" content="real">`,
        );

        expect(head).not.toContain("commented");
        expect(head).not.toContain("scripted");
        expect(head).not.toContain("icon");
        expect(head).toContain("real");
    });

    test("an unclosed comment swallows the rest rather than leaking it", () => {
        expect(sliceHead(`<meta name="a" content="1"><!-- <meta name="b">`)).toBe(
            `<meta name="a" content="1">`,
        );
    });
});

describe("readHeadTags", () => {
    test("keeps a quoted > inside a value", () => {
        const [tag] = readHeadTags(`<meta name="description" content="5 > 3, says me">`);

        expect(tag.value).toBe("5 > 3, says me");
    });

    test("prefers property over name when a tag carries both", () => {
        const [tag] = readHeadTags(
            `<meta name="description" property="og:description" content="x">`,
        );

        expect(tag).toEqual({
            kind: "meta",
            key: "og:description",
            value: "x",
            attribute: "property",
        });
    });

    test("records which attribute an Open Graph key arrived on", () => {
        const [tag] = readHeadTags(`<meta name="og:title" content="x">`);

        expect(tag.attribute).toBe("name");
    });

    test("ignores a meta with no content and a link with no href", () => {
        expect(readHeadTags(`<meta property="og:title"><link rel="icon">`)).toEqual([]);
    });

    test("ignores tags in the body", () => {
        const keys = readHeadTags(PAGE).map((tag) => `${tag.key}=${tag.value}`);

        expect(keys).not.toContain("og:title=Body tag");
    });
});

describe("readOpenGraphImages", () => {
    test("attaches structured properties to the nearest image above them", () => {
        const images = readOpenGraphImages(readHeadTags(PAGE));

        expect(images).toEqual([
            {
                url: "/cover.png",
                secureUrl: null,
                type: null,
                width: 1200,
                height: 630,
                alt: "A cover",
            },
            {
                url: "https://cdn.example/second.jpg",
                secureUrl: null,
                type: null,
                width: null,
                height: null,
                alt: null,
            },
        ]);
    });

    test("treats og:image:url after the same og:image as one picture", () => {
        const images = readOpenGraphImages(
            readHeadTags(
                `<meta property="og:image" content="a.png"><meta property="og:image:url" content="a.png">`,
            ),
        );

        expect(images).toHaveLength(1);
    });

    test("drops a structured property with no image above it", () => {
        expect(
            readOpenGraphImages(readHeadTags(`<meta property="og:image:width" content="10">`)),
        ).toEqual([]);
    });
});

describe("readPreviewTags", () => {
    const tags = readPreviewTags(PAGE);

    test("decodes entities and tidies whitespace", () => {
        expect(tags.og.title).toBe('It’s a "test" — ok');
        expect(tags.document.title).toBe("Fallback title");
    });

    test("reads the document fallbacks", () => {
        expect(tags.document).toEqual({
            title: "Fallback title",
            description: "Plain description",
            canonical: "https://example.com/post",
            themeColor: "#0a7",
            icon: "/favicon.png",
            oembed: "https://example.com/oembed?u=1",
            lang: "bn",
        });
    });

    test("lower-cases the card type, reads the legacy image spelling, and pairs labels", () => {
        expect(tags.twitter.card).toBe("summary_large_image");
        expect(tags.twitter.image).toBe("https://cdn.example/x.png");
        expect(tags.twitter.labels).toEqual([{ label: "Reading time", data: "4 min" }]);
    });

    test("a page with no head element still has tags", () => {
        expect(readPreviewTags(`<meta property="og:title" content="Bare">`).og.title).toBe("Bare");
    });

    test("an empty value counts as absent", () => {
        expect(readPreviewTags(`<meta property="og:title" content="   ">`).og.title).toBeNull();
    });
});
