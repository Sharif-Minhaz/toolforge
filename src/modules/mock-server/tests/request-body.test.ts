import { describe, expect, test } from "bun:test";

import {
    isFormType,
    isMultipartType,
    parseRequestBody,
} from "@/modules/mock-server/domain/request-body";

const FORM = "application/x-www-form-urlencoded";
const MULTIPART = 'multipart/form-data; boundary="X"';

/**
 * A multipart body as the route handler hands it over: one character per byte.
 *
 * That is the contract `parseRequestBody` is written against, and building the
 * fixture any other way would test something the parser never receives. `€` is
 * one JavaScript character and three bytes on the wire, so it has to be three
 * characters here — which is exactly the difference that made the old size
 * wrong.
 */
function latin1(utf8Text: string): string {
    return String.fromCharCode(...new TextEncoder().encode(utf8Text));
}

/** A multipart body, written the way a browser writes one. */
function multipart(...parts: readonly string[]): string {
    return latin1(`${parts.map((part) => `--X\r\n${part}\r\n`).join("")}--X--\r\n`);
}

describe("recognising the types", () => {
    test("a form type survives its charset parameter", () => {
        expect(isFormType(`${FORM}; charset=utf-8`)).toBe(true);
        expect(isFormType("APPLICATION/X-WWW-FORM-URLENCODED")).toBe(true);
    });

    test("multipart is told apart from a plain form", () => {
        expect(isMultipartType(MULTIPART)).toBe(true);
        expect(isMultipartType(FORM)).toBe(false);
        expect(isFormType(MULTIPART)).toBe(false);
    });
});

describe("parseRequestBody", () => {
    test("an empty body is null whatever it claims to be", () => {
        expect(parseRequestBody("", "application/json")).toBeNull();
        expect(parseRequestBody("", FORM)).toBeNull();
    });

    describe("json", () => {
        test("parses an object", () => {
            expect(parseRequestBody('{"a":1}', "application/json")).toEqual({ a: 1 });
        });

        test("parses a +json suffix type", () => {
            expect(parseRequestBody('{"a":1}', "application/vnd.api+json")).toEqual({ a: 1 });
        });

        /** The graph decides what it cares about; refusing answers nothing. */
        test("keeps the text when it is not actually JSON", () => {
            expect(parseRequestBody("not json", "application/json")).toBe("not json");
        });
    });

    describe("a plain form post", () => {
        /**
         * The gap this file closed. A form body used to arrive as its raw
         * string, so `From the request → Body → email` read a property off a
         * string and got nothing — the condition did not fail, it quietly
         * matched nothing, which is worse.
         */
        test("reads fields a value tree can address", () => {
            expect(parseRequestBody("email=a%40b.com&remember=on", FORM)).toEqual({
                email: "a@b.com",
                remember: "on",
            });
        });

        /** The pair everybody gets wrong, which is why `URLSearchParams` does it. */
        test("a plus is a space and %2B is a plus", () => {
            expect(parseRequestBody("name=John+Doe&sign=%2B1", FORM)).toEqual({
                name: "John Doe",
                sign: "+1",
            });
        });

        /**
         * Last-one-wins would throw away half the request, which is precisely
         * what somebody is using a mock to look at.
         */
        test("a repeated field is an array, in order", () => {
            expect(parseRequestBody("tag=a&tag=b&tag=c", FORM)).toEqual({
                tag: ["a", "b", "c"],
            });
        });

        test("an empty value is kept rather than dropped", () => {
            expect(parseRequestBody("q=&page=2", FORM)).toEqual({ q: "", page: "2" });
        });

        test("a bare key with no equals is an empty value", () => {
            expect(parseRequestBody("flag", FORM)).toEqual({ flag: "" });
        });
    });

    describe("a form with a file in it", () => {
        test("reads the text fields", () => {
            const body = multipart(
                'Content-Disposition: form-data; name="title"\r\n\r\nHoliday',
                'Content-Disposition: form-data; name="tags"\r\n\r\nsea',
            );

            expect(parseRequestBody(body, MULTIPART)).toEqual({ title: "Holiday", tags: "sea" });
        });

        /**
         * A file is described, never carried. A five-megabyte upload has no
         * business inside a condition, and by this point the bytes have been
         * through `text()` and mean nothing anyway.
         */
        test("describes a file rather than embedding it", () => {
            const body = multipart(
                'Content-Disposition: form-data; name="avatar"; filename="me.png"\r\n' +
                    "Content-Type: image/png\r\n\r\nBINARY",
            );

            expect(parseRequestBody(body, MULTIPART)).toEqual({
                avatar: { filename: "me.png", contentType: "image/png", size: 6 },
            });
        });

        test("a file part with no type is called octet-stream", () => {
            const body = multipart(
                'Content-Disposition: form-data; name="f"; filename="a.bin"\r\n\r\nxy',
            );

            expect(parseRequestBody(body, MULTIPART)).toEqual({
                f: { filename: "a.bin", contentType: "application/octet-stream", size: 2 },
            });
        });

        /** Bytes, because "was the upload over a megabyte" is a byte question. */
        test("counts a file's size in bytes, not characters", () => {
            const body = multipart(
                'Content-Disposition: form-data; name="f"; filename="a.txt"\r\n\r\n€',
            );
            const parsed = parseRequestBody(body, MULTIPART) as { f: { size: number } };

            expect(parsed.f.size).toBe(3);
        });

        /**
         * The bug the latin1 contract exists for. Read with `text()`, a byte
         * sequence that is not valid UTF-8 — which is most of any real image —
         * collapses to U+FFFD, and a size counted afterwards has no relation to
         * the file. These are the first bytes of a PNG, three of which are
         * invalid UTF-8 on their own.
         */
        test("reports the true size of bytes that are not valid UTF-8", () => {
            const png = "\x89PNG\r\n\x1a\n\xff\xd8\xfe";
            const body =
                latin1('--X\r\nContent-Disposition: form-data; name="f"; filename="a.png"\r\n') +
                latin1("Content-Type: image/png\r\n\r\n") +
                png +
                latin1("\r\n--X--\r\n");
            const parsed = parseRequestBody(body, MULTIPART) as { f: { size: number } };

            expect(parsed.f.size).toBe(png.length);
            expect(parsed.f.size).toBe(11);
        });

        test("a text field keeps its accents", () => {
            const body = multipart('Content-Disposition: form-data; name="who"\r\n\r\nnaïve café');

            expect(parseRequestBody(body, MULTIPART)).toEqual({ who: "naïve café" });
        });

        test("a filename keeps its accents", () => {
            const body = multipart(
                'Content-Disposition: form-data; name="f"; filename="résumé.pdf"\r\n\r\nx',
            );

            expect(parseRequestBody(body, MULTIPART)).toEqual({
                f: { filename: "résumé.pdf", contentType: "application/octet-stream", size: 1 },
            });
        });

        test("mixes fields and files in one body", () => {
            const body = multipart(
                'Content-Disposition: form-data; name="title"\r\n\r\nHoliday',
                'Content-Disposition: form-data; name="photo"; filename="a.jpg"\r\n' +
                    "Content-Type: image/jpeg\r\n\r\nJPEG",
            );

            expect(parseRequestBody(body, MULTIPART)).toEqual({
                title: "Holiday",
                photo: { filename: "a.jpg", contentType: "image/jpeg", size: 4 },
            });
        });

        test("a repeated field is an array here too", () => {
            const body = multipart(
                'Content-Disposition: form-data; name="tag"\r\n\r\na',
                'Content-Disposition: form-data; name="tag"\r\n\r\nb',
            );

            expect(parseRequestBody(body, MULTIPART)).toEqual({ tag: ["a", "b"] });
        });

        /**
         * A known limitation, pinned rather than hidden: splitting on the
         * boundary cuts a value that happens to contain it. Real clients pick a
         * boundary they have checked does not occur in the content — that is
         * what the RFC requires of them and why browsers generate a random one
         * — so this is reachable only by hand-writing a body that breaks its own
         * framing. Worth a test so the behaviour is recorded.
         */
        test("a value containing the boundary is cut short — a known limitation", () => {
            const body = multipart(
                'Content-Disposition: form-data; name="note"\r\n\r\nsee --X in the text?',
            );

            expect(parseRequestBody(body, MULTIPART)).toEqual({ note: "see " });
        });

        describe("degradation", () => {
            /** Without a boundary there is nothing to split on. */
            test("keeps the text when the type names no boundary", () => {
                expect(parseRequestBody("whatever", "multipart/form-data")).toBe("whatever");
            });

            test("reads an unquoted boundary", () => {
                const body =
                    '--Y\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--Y--\r\n';

                expect(parseRequestBody(body, "multipart/form-data; boundary=Y")).toEqual({
                    a: "1",
                });
            });

            test("skips a part with no name rather than failing the body", () => {
                const body = multipart(
                    "Content-Disposition: form-data\r\n\r\norphan",
                    'Content-Disposition: form-data; name="kept"\r\n\r\nyes',
                );

                expect(parseRequestBody(body, MULTIPART)).toEqual({ kept: "yes" });
            });

            test("survives a body with no parts at all", () => {
                expect(parseRequestBody("--X--\r\n", MULTIPART)).toEqual({});
            });
        });
    });

    describe("everything else", () => {
        test("plain text is kept as text", () => {
            expect(parseRequestBody("hello", "text/plain")).toBe("hello");
        });

        test("a body with no content type at all is kept as text", () => {
            expect(parseRequestBody("hello", "")).toBe("hello");
        });

        test("XML is kept as text, since nothing here reads it", () => {
            expect(parseRequestBody("<a/>", "application/xml")).toBe("<a/>");
        });
    });
});
