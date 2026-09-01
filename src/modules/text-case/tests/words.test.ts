import { describe, expect, test } from "bun:test";

import { mapProseWords, splitWords } from "@/modules/text-case/domain/words";

describe("splitWords — the pieces an identifier is built from", () => {
    test("splits on every kind of punctuation and space", () => {
        expect(splitWords("hello world")).toEqual(["hello", "world"]);
        expect(splitWords("hello_world")).toEqual(["hello", "world"]);
        expect(splitWords("hello-world")).toEqual(["hello", "world"]);
        expect(splitWords("hello.world/again")).toEqual(["hello", "world", "again"]);
        expect(splitWords("  hello,   world!  ")).toEqual(["hello", "world"]);
    });

    test("splits a camel hump", () => {
        expect(splitWords("fooBar")).toEqual(["foo", "Bar"]);
        expect(splitWords("getUserById")).toEqual(["get", "User", "By", "Id"]);
    });

    test("ends an acronym where the next word begins", () => {
        expect(splitWords("XMLHttpRequest")).toEqual(["XML", "Http", "Request"]);
        expect(splitWords("HTTPServer")).toEqual(["HTTP", "Server"]);
        expect(splitWords("parseJSON")).toEqual(["parse", "JSON"]);
    });

    test("leaves an acronym standing on its own alone", () => {
        expect(splitWords("HTTP")).toEqual(["HTTP"]);
        expect(splitWords("ABC DEF")).toEqual(["ABC", "DEF"]);
    });

    test("keeps digits attached to the run they were typed in", () => {
        expect(splitWords("utf8Decoder")).toEqual(["utf8", "Decoder"]);
        expect(splitWords("base64")).toEqual(["base64"]);
        expect(splitWords("h264Encoder")).toEqual(["h264", "Encoder"]);
    });

    test("drops an apostrophe rather than splitting on it", () => {
        expect(splitWords("don't stop")).toEqual(["dont", "stop"]);
        expect(splitWords("it’s fine")).toEqual(["its", "fine"]);
    });

    test("keeps a Bangla word whole, marks and all", () => {
        // The vowels are combining marks. Splitting on them would leave the
        // consonants stranded one per word.
        expect(splitWords("বাংলা টেক্সট")).toEqual(["বাংলা", "টেক্সট"]);
    });

    test("finds nothing in text made only of punctuation", () => {
        expect(splitWords("!!! ??? ---")).toEqual([]);
        expect(splitWords("")).toEqual([]);
    });
});

describe("mapProseWords — rewriting words in place", () => {
    test("leaves everything between the words exactly where it was", () => {
        expect(mapProseWords("  (hello, world!)  ", (word) => word.text.toUpperCase())).toBe(
            "  (HELLO, WORLD!)  ",
        );
    });

    test("treats a contraction as one word", () => {
        const words: string[] = [];

        mapProseWords("don’t stop", (word) => {
            words.push(word.text);

            return word.text;
        });

        expect(words).toEqual(["don’t", "stop"]);
    });

    test("hands each word the text that preceded it", () => {
        const gaps: string[] = [];

        mapProseWords("one. two", (word) => {
            gaps.push(word.gap);

            return word.text;
        });

        expect(gaps).toEqual(["", ". "]);
    });

    test("reports the total so the last word can be recognised", () => {
        const totals: number[] = [];

        mapProseWords("a b c", (word, total) => {
            totals.push(total);

            return word.text;
        });

        expect(totals).toEqual([3, 3, 3]);
    });

    test("returns text with no words untouched", () => {
        expect(mapProseWords("!!! ???", (word) => word.text.toUpperCase())).toBe("!!! ???");
    });
});
