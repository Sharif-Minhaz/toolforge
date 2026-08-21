import { describe, expect, test } from "bun:test";

import { escapeHtml } from "@/modules/tools/domain/html-escape";

describe("escapeHtml", () => {
    test("neutralises every character that could open a tag or attribute", () => {
        expect(escapeHtml(`<script>alert("x" & 'y')</script>`)).toBe(
            "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;",
        );
    });

    test("leaves ordinary prose and emoji untouched", () => {
        expect(escapeHtml("Lorem ipsum dolor sit amet.")).toBe("Lorem ipsum dolor sit amet.");
        expect(escapeHtml("🚀 আকাশ")).toBe("🚀 আকাশ");
    });

    test("escapes an ampersand once, not twice", () => {
        expect(escapeHtml("&amp;")).toBe("&amp;amp;");
    });
});
