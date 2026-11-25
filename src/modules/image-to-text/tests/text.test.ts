import { describe, expect, test } from "bun:test";

import { countText, tidyRecognizedText } from "../domain/text";

describe("tidyRecognizedText", () => {
    test("removes the space Tesseract puts between Chinese characters", () => {
        expect(tidyRecognizedText("这 是 中 文 。\n")).toBe("这是中文。");
    });

    test("removes it between kana and kanji too", () => {
        expect(tidyRecognizedText("東 京 に い ま す")).toBe("東京にいます");
    });

    test("keeps the space between CJK and Latin text", () => {
        expect(tidyRecognizedText("東 京 Tower 2026")).toBe("東京 Tower 2026");
    });

    test("leaves spaces between words in other scripts alone", () => {
        expect(tidyRecognizedText("আমার সোনার বাংলা")).toBe("আমার সোনার বাংলা");
        expect(tidyRecognizedText("مرحبا بالعالم")).toBe("مرحبا بالعالم");
        expect(tidyRecognizedText("नमस्ते दुनिया")).toBe("नमस्ते दुनिया");
    });

    test("strips the page's form feed, trailing spaces and Windows line ends", () => {
        expect(tidyRecognizedText("Total   \r\nVAT \t\r\n\f")).toBe("Total\nVAT");
    });

    test("collapses runs of blank lines to one", () => {
        expect(tidyRecognizedText("one\n\n\n\n\ntwo")).toBe("one\n\ntwo");
    });

    test("does not join lines of CJK text", () => {
        expect(tidyRecognizedText("中 文\n日 本")).toBe("中文\n日本");
    });

    test("an empty page is an empty string", () => {
        expect(tidyRecognizedText(" \n\f\n ")).toBe("");
    });
});

describe("countText", () => {
    test("counts characters, not UTF-16 code units", () => {
        expect(countText("𠀋😀")).toEqual({ characters: 2, lines: 1 });
    });

    test("counts lines", () => {
        expect(countText("a\nb\n\nc")).toEqual({ characters: 6, lines: 4 });
    });

    test("an empty box has no lines", () => {
        expect(countText("")).toEqual({ characters: 0, lines: 0 });
    });
});
