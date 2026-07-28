import { describe, expect, test } from "bun:test";

import { BLOCKED_WORDS } from "@/modules/ai-text-detector/domain/blocklist";
import {
    containsBlockedWords,
    findBlockedWords,
    maskBlockedWord,
} from "@/modules/ai-text-detector/domain/profanity";

/** Long enough to be a realistic passage; the wrapper is deliberately innocent. */
function passage(inner: string): string {
    return `The report was filed on Tuesday. ${inner} Everyone agreed to revisit it next quarter.`;
}

describe("findBlockedWords — plain matches", () => {
    test("flags a blocked word in a sentence", () => {
        expect(findBlockedWords(passage("This is complete bullshit."))).toEqual([
            { term: "bullshit", match: "bullshit" },
        ]);
    });

    test("is case-insensitive", () => {
        expect(containsBlockedWords("What a BITCH of a build")).toBe(true);
        expect(containsBlockedWords("What a BiTcH of a build")).toBe(true);
    });

    test("strips punctuation clinging to the word", () => {
        expect(findBlockedWords("oh, shit!")).toEqual([{ term: "shit", match: "shit" }]);
    });

    test("deduplicates by entry and keeps first-seen order", () => {
        const found = findBlockedWords("shit, then bullshit, then shit again");

        expect(found.map((entry) => entry.term)).toEqual(["shit", "bullshit"]);
    });

    test("reports nothing for ordinary prose", () => {
        expect(findBlockedWords(passage("The findings were inconclusive."))).toEqual([]);
        expect(containsBlockedWords("")).toBe(false);
    });
});

describe("findBlockedWords — the Scunthorpe problem", () => {
    // Every one of these contains a rude substring. Matching is whole-token,
    // so none of them may ever be flagged.
    const INNOCENT = [
        "Scunthorpe",
        "Penistone",
        "Sussex",
        "classic",
        "class",
        "assassin",
        "bass",
        "grass",
        "passage",
        "assignment",
        "assumption",
        "cocktail",
        "cockpit",
        "shuttlecock",
        "Hancock",
        "analysis",
        "therapist",
        "Matsushita",
        "titles",
        "constitution",
        "dickens",
        "shiitake",
        "clbuttic",
    ] as const;

    for (const word of INNOCENT) {
        test(`leaves "${word}" alone`, () => {
            expect(findBlockedWords(passage(`We reviewed the ${word} carefully.`))).toEqual([]);
        });
    }

    test("leaves a whole innocent paragraph alone", () => {
        expect(containsBlockedWords(INNOCENT.join(" "))).toBe(false);
    });
});

describe("findBlockedWords — deliberately excluded terms", () => {
    // Ambiguous words are kept off the list on purpose: a false positive locks
    // the reader out, and each of these has an everyday reading.
    const ALLOWED = ["ass", "arse", "dick", "cock", "fag", "chink", "cum", "damn", "hell", "crap"];

    for (const word of ALLOWED) {
        test(`does not block "${word}"`, () => {
            expect(containsBlockedWords(`the ${word} of the matter`)).toBe(false);
        });
    }

    test("still blocks the unambiguous compound built from an allowed word", () => {
        expect(containsBlockedWords("what an asshole")).toBe(true);
        expect(containsBlockedWords("total dickhead")).toBe(true);
    });
});

describe("findBlockedWords — obfuscation", () => {
    test("sees through separators", () => {
        expect(containsBlockedWords("f-u-c-k this")).toBe(true);
        expect(containsBlockedWords("s*h*i*t")).toBe(true);
        expect(containsBlockedWords("b.i.t.c.h")).toBe(true);
    });

    test("sees through leetspeak", () => {
        expect(containsBlockedWords("b1tch")).toBe(true);
        expect(containsBlockedWords("sh1t")).toBe(true);
        expect(containsBlockedWords("f@ggot")).toBe(true);
        expect(containsBlockedWords("wh0re")).toBe(true);
    });

    test("resolves ! to i only between two characters", () => {
        // Interior: a genuine substitution.
        expect(containsBlockedWords("b!tch")).toBe(true);
        // Terminal: an exclamation mark, and folding it to "i" would turn every
        // blocked word ending in a shout into a miss.
        expect(findBlockedWords("oh shit!")).toEqual([{ term: "shit", match: "shit" }]);
    });

    test("an ordinary exclamation is never a match on its own", () => {
        expect(containsBlockedWords("Great news! We shipped it!")).toBe(false);
    });

    test("sees through stretched letters, collapsed either way", () => {
        expect(containsBlockedWords("fuuuuck")).toBe(true);
        expect(containsBlockedWords("shiiit")).toBe(true);
        expect(containsBlockedWords("bitttch")).toBe(true);
    });

    test("reports the token as the reader typed it, so they can find it", () => {
        expect(findBlockedWords("that is f-u-c-k-i-n-g wrong")).toEqual([
            { term: "fucking", match: "f-u-c-k-i-n-g" },
        ]);
    });

    test("does not invent a match from letters split across words", () => {
        expect(containsBlockedWords("f u c k")).toBe(false);
    });
});

describe("findBlockedWords — Bangla", () => {
    test("flags a Bengali-script term", () => {
        expect(containsBlockedWords("এই লোকটা একটা খানকি")).toBe(true);
    });

    test("flags the same term typed on a Latin keyboard", () => {
        expect(containsBlockedWords("ei lokta ekta khanki")).toBe(true);
    });

    test("leaves ordinary Bangla prose alone", () => {
        expect(containsBlockedWords("কৃত্রিম বুদ্ধিমত্তা দ্রুত এগিয়ে যাচ্ছে। এটি ভালো খবর।")).toBe(
            false,
        );
    });
});

describe("blocklist hygiene", () => {
    test("holds no duplicates", () => {
        expect(new Set(BLOCKED_WORDS).size).toBe(BLOCKED_WORDS.length);
    });

    test("is entirely lower case, so folding is the only normalisation needed", () => {
        for (const word of BLOCKED_WORDS) {
            expect(word).toBe(word.toLowerCase());
        }
    });

    test("holds no blank or single-character entries", () => {
        for (const word of BLOCKED_WORDS) {
            expect(word.trim().length).toBeGreaterThan(1);
        }
    });

    test("every entry matches itself", () => {
        for (const word of BLOCKED_WORDS) {
            expect(containsBlockedWords(word)).toBe(true);
        }
    });
});

describe("maskBlockedWord", () => {
    test("keeps the first and last character", () => {
        expect(maskBlockedWord("shit")).toBe("s**t");
        expect(maskBlockedWord("bullshit")).toBe("b******t");
    });

    test("hides a very short word completely", () => {
        expect(maskBlockedWord("ab")).toBe("**");
        expect(maskBlockedWord("a")).toBe("*");
        expect(maskBlockedWord("")).toBe("");
    });

    test("masks a separated token without losing its shape", () => {
        expect(maskBlockedWord("f-u-c-k")).toBe("f*****k");
    });
});
