import { describe, expect, test } from "bun:test";

import { chunkSpeechText, splitAtBoundaries } from "@/modules/text-to-speech/domain/chunks";
import { MAX_SPEECH_CHARACTERS } from "@/modules/text-to-speech/domain/constants";
import { splitAtPauseMarkers } from "@/modules/text-to-speech/domain/script";
import {
    assembleTranslation,
    buildTranslateUrl,
    MAX_TRANSLATE_QUERY,
    planTranslation,
    readTranslation,
    translationTargetFor,
} from "@/modules/text-to-speech/domain/translation";

/*
 * Three answers from the live endpoint, captured on 2026-10-17 over a mobile
 * network, verbatim. They are the cross-check that is not us: the reader below
 * is held to what Google actually sent, not to what its shape was assumed to be.
 */
const LIVE_EN_TO_AR = [
    [
        ["أهلاً بك. ", "Hello there. ", null, null, 10],
        ["كيف حالك اليوم؟", "How are you today?", null, null, 10],
    ],
    null,
    "en",
    null,
    null,
    null,
    1,
    [],
    [["en"], null, [1], ["en"]],
];

const LIVE_EN_TO_BN_WITH_MARKER = [
    [
        ["শুভ সকাল। ", "Good morning. ", null, null, 3, null, null, [[]], [[["bb93", "tea.md"]]]],
        [
            "[বিরাম 2s] এটি একটি পরীক্ষা।\n",
            "[pause 2s] This is a test.\n",
            null,
            null,
            3,
            null,
            null,
            [[]],
            [[["bb93", "tea.md"], true]],
        ],
        ["দ্বিতীয় লাইন", "Second line", null, null, 3, null, null, [[]], [[["bb93", "tea.md"]]]],
    ],
    null,
    "en",
    null,
    null,
    null,
    1,
    [],
    [["en"], null, [1], ["en"]],
];

const LIVE_BN_TO_EN = [
    [["how are you", "ভালো আছেন আপনি?", null, null, 3, null, null, [[]], [[["1eb5", "tea.md"]]]]],
    null,
    "bn",
    null,
    null,
    null,
    1,
    [],
    [["bn"], null, [1], ["bn"]],
];

describe("reading the endpoint's answer", () => {
    test("joins the segments and reports the detected language", () => {
        expect(readTranslation(LIVE_EN_TO_AR)).toEqual({
            text: "أهلاً بك. كيف حالك اليوم؟",
            source: "en",
        });
        expect(readTranslation(LIVE_BN_TO_EN)).toEqual({ text: "how are you", source: "bn" });
    });

    test("keeps the line break inside the segment it ends", () => {
        expect(readTranslation(LIVE_EN_TO_BN_WITH_MARKER)?.text).toBe(
            "শুভ সকাল। [বিরাম 2s] এটি একটি পরীক্ষা।\nদ্বিতীয় লাইন",
        );
    });

    test("anything that is not that shape is unreadable, not an empty translation", () => {
        for (const body of [
            null,
            "<html>Sorry…</html>",
            {},
            [],
            [[]],
            [[[42]]],
            [null, null, "en"],
        ]) {
            expect(readTranslation(body)).toBeNull();
        }
    });
});

describe("planning a translation", () => {
    test("never sends a marker — the live answer above is why", () => {
        const plan = planTranslation("Good morning. [pause 2s] This is a test.");

        expect(plan).toEqual({
            ok: true,
            requests: 2,
            pieces: [
                { kind: "translate", lead: "", text: "Good morning.", trail: " " },
                { kind: "keep", text: "[pause 2s]" },
                { kind: "translate", lead: " ", text: "This is a test.", trail: "" },
            ],
        });
    });

    test("puts markers and surrounding whitespace back exactly", () => {
        const plan = planTranslation("One.\n\n[pause 1s]\nTwo.  ");

        if (!plan.ok) {
            throw new Error("expected a plan");
        }

        expect(assembleTranslation(plan.pieces, ["এক।", "দুই।"])).toBe("এক।\n\n[pause 1s]\nদুই।  ");
    });

    test("leaves blank runs between markers alone and asks nothing for them", () => {
        const plan = planTranslation("[pause 1s]   [pause 2s]");

        expect(plan).toEqual({ ok: false, reason: "empty" });
    });

    test("refuses an empty box and one over the speech ceiling", () => {
        expect(planTranslation("")).toEqual({ ok: false, reason: "empty" });
        expect(planTranslation("a".repeat(MAX_SPEECH_CHARACTERS + 1))).toEqual({
            ok: false,
            reason: "too_long",
        });
    });

    test("cuts long text so every request's URL-encoded query fits", () => {
        // Bangla is nine encoded characters a letter, so 10,000 of them cannot
        // go in one request.
        const plan = planTranslation("আমি ভালো আছি। ".repeat(700));

        if (!plan.ok) {
            throw new Error("expected a plan");
        }

        expect(plan.requests).toBeGreaterThan(1);

        for (const piece of plan.pieces) {
            if (piece.kind === "translate") {
                expect(encodeURIComponent(piece.text).length).toBeLessThanOrEqual(
                    MAX_TRANSLATE_QUERY,
                );
            }
        }
    });
});

describe("the request", () => {
    test("is the URL that was verified by hand, with the text encoded last", () => {
        expect(buildTranslateUrl("Hello there. How are you today?", "ar")).toBe(
            "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t&q=Hello%20there.%20How%20are%20you%20today%3F",
        );
    });

    test("maps a voice's locale to Google's code", () => {
        expect(translationTargetFor("ar-SA")).toBe("ar");
        expect(translationTargetFor("bn-BD")).toBe("bn");
        expect(translationTargetFor("he-IL")).toBe("iw");
        expect(translationTargetFor("fil-PH")).toBe("tl");
        expect(translationTargetFor("zh-HK")).toBe("zh-TW");
        expect(translationTargetFor("zh-CN-liaoning")).toBe("zh-CN");
        expect(translationTargetFor("pt-PT")).toBe("pt-PT");
        expect(translationTargetFor("pt-BR")).toBe("pt");
    });
});

describe("the shared splitters", () => {
    test("an exact split loses nothing", () => {
        const text = "First line.\nSecond, longer line here.  Third!\n\n";
        const pieces = splitAtBoundaries(text, () => 1, 12);

        expect(pieces.join("")).toBe(text);
        expect(pieces.length).toBeGreaterThan(1);
    });

    test("speech chunks are the same pieces, trimmed", () => {
        expect(chunkSpeechText("One two. Three four five", 20)).toEqual([
            "One two.",
            "Three four five",
        ]);
    });

    test("markers are split out with their exact spelling", () => {
        expect(splitAtPauseMarkers("a [Pause 2 s] b")).toEqual([
            { kind: "text", text: "a " },
            { kind: "marker", text: "[Pause 2 s]" },
            { kind: "text", text: " b" },
        ]);
    });
});
