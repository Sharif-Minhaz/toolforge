import { describe, expect, test } from "bun:test";

import { decodeEntities } from "@/modules/tools/domain/html-entities";

describe("decodeEntities", () => {
    test("decodes the named entities that actually appear in titles", () => {
        expect(decodeEntities("Tom &amp; Jerry &lt;3 &quot;x&quot;")).toBe('Tom & Jerry <3 "x"');
    });

    test("decodes numeric and hex references", () => {
        expect(decodeEntities("caf&#233; &#x2014; bar")).toBe("café — bar");
    });

    test("decodes the typography a CMS writes into a headline", () => {
        expect(decodeEntities("It&rsquo;s here &mdash; finally&hellip;")).toBe(
            "It’s here — finally…",
        );
        expect(decodeEntities("&ldquo;Quoted&rdquo; &laquo;guillemets&raquo;")).toBe(
            "“Quoted” «guillemets»",
        );
    });

    test("folds case for the names it knows, because publishers write &AMP;", () => {
        expect(decodeEntities("A &AMP; B")).toBe("A & B");
    });

    test("decodes a non-breaking space as one, not as a plain space", () => {
        expect(decodeEntities("10&nbsp;km")).toBe("10 km");
    });

    test("leaves an unknown entity exactly as written", () => {
        expect(decodeEntities("a &notareal; b")).toBe("a &notareal; b");
    });

    test("leaves a surrogate half or an out-of-range reference alone", () => {
        expect(decodeEntities("&#xD800;")).toBe("&#xD800;");
        expect(decodeEntities("&#x110000;")).toBe("&#x110000;");
        expect(decodeEntities("&#0;")).toBe("&#0;");
    });

    test("decodes an astral-plane reference into one code point", () => {
        expect(decodeEntities("&#x1F600;")).toBe("\u{1F600}");
    });
});
