import { describe, expect, test } from "bun:test";

import {
    familyFor,
    requiredFontFamilies,
    splitIntoFontRuns,
} from "@/modules/pdf-converter/domain/font-runs";
import {
    isDrawableScript,
    scriptOfCodepoint,
    scriptsIn,
    unsupportedScriptsIn,
} from "@/modules/pdf-converter/domain/scripts";
import type { PdfScript, SourceDocument } from "@/modules/pdf-converter/types";

describe("script classification", () => {
    const CASES: readonly (readonly [string, PdfScript])[] = [
        ["A", "latin"],
        ["ß", "latin"],
        ["Ж", "latin"],
        ["π", "latin"],
        ["।", "devanagari"],
        ["ক", "bengali"],
        ["০", "bengali"],
        ["中", "cjk"],
        ["あ", "cjk"],
        ["한", "hangul"],
        ["ا", "arabic"],
        ["א", "hebrew"],
        ["ก", "thai"],
    ];

    test.each(CASES)("puts %s in the %s block", (character, script) => {
        expect(scriptOfCodepoint(character.codePointAt(0) ?? 0)).toBe(script);
    });

    test("reports scripts in a fixed order, not the order they appeared", () => {
        expect(scriptsIn("中文 before বাংলা")).toEqual(["latin", "bengali", "cjk"]);
        expect(scriptsIn("বাংলা before 中文")).toEqual(["latin", "bengali", "cjk"]);
    });

    test("ignores whitespace and joiners, which belong to no script", () => {
        expect(scriptsIn("   \n\t")).toEqual([]);
    });

    test("only the two scripts with a font are drawable", () => {
        expect(isDrawableScript("latin")).toBe(true);
        expect(isDrawableScript("bengali")).toBe(true);
        expect(isDrawableScript("cjk")).toBe(false);
    });

    test("names what no bundled font can draw", () => {
        expect(unsupportedScriptsIn("Hello বাংলা")).toEqual([]);
        expect(unsupportedScriptsIn("Hello 世界 مرحبا")).toEqual(["arabic", "cjk"]);
    });
});

describe("font runs", () => {
    test("script wins over monospace, because Roboto Mono has no Bengali", () => {
        expect(familyFor("bengali", true)).toBe("NotoSansBengali");
        expect(familyFor("latin", true)).toBe("RobotoMono");
        expect(familyFor("latin", false)).toBe("Roboto");
    });

    test("splits a mixed line so neither family is asked for glyphs it lacks", () => {
        // The colon is the case that matters: Noto Sans Bengali carries no
        // Latin glyphs at all, so a whole-paragraph font would print a box.
        expect(splitIntoFontRuns("সংখ্যা: 42")).toEqual([
            { text: "সংখ্যা", font: "NotoSansBengali" },
            { text: ": 42", font: "Roboto" },
        ]);
    });

    test("keeps a joiner inside its own run rather than starting a new one", () => {
        const runs = splitIntoFontRuns("ক‌ষ");

        expect(runs).toHaveLength(1);
        expect(runs[0].font).toBe("NotoSansBengali");
    });

    test("a space extends the current run instead of switching family", () => {
        expect(splitIntoFontRuns("one two")).toEqual([{ text: "one two", font: "Roboto" }]);
    });

    test("returns nothing for an empty string", () => {
        expect(splitIntoFontRuns("")).toEqual([]);
    });

    test("a document's families are asked once, across every block kind", () => {
        const document: SourceDocument = {
            layout: "flow",
            title: null,
            blocks: [
                { kind: "paragraph", runs: [{ text: "plain" }] },
                { kind: "code", text: "const x = 1;" },
                {
                    kind: "table",
                    head: null,
                    rows: [[{ runs: [{ text: "ঢাকা" }] }]],
                    caption: null,
                },
            ],
        };

        expect([...requiredFontFamilies(document)].sort()).toEqual([
            "NotoSansBengali",
            "Roboto",
            "RobotoMono",
        ]);
    });

    test("a deck's families come from its shapes and its notes", () => {
        const document: SourceDocument = {
            layout: "slides",
            title: null,
            slideWidthEmu: 12_192_000,
            slideHeightEmu: 6_858_000,
            slides: [
                {
                    number: 1,
                    shapes: [
                        {
                            kind: "text",
                            frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
                            placeholder: "title",
                            paragraphs: [
                                {
                                    level: 0,
                                    bulleted: false,
                                    align: "left",
                                    sizePt: null,
                                    runs: [{ text: "শিরোনাম" }],
                                },
                            ],
                        },
                    ],
                    notes: [{ kind: "paragraph", runs: [{ text: "English note" }] }],
                },
            ],
        };

        expect([...requiredFontFamilies(document)].sort()).toEqual(["NotoSansBengali", "Roboto"]);
    });
});
