import { describe, expect, test } from "bun:test";

import { readVisitorRequest, toCliJson, toCliText } from "../domain/request";
import { cliQuerySchema } from "../validation/cli";

const CHROME = new Headers({
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/156.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br, zstd",
    "sec-ch-ua-platform": '"Linux"',
    "sec-ch-ua-mobile": "?0",
    "sec-gpc": "  1 ",
});

describe("readVisitorRequest", () => {
    test("classifies the address it is handed", () => {
        expect(readVisitorRequest("203.0.113.9", CHROME).address).toEqual({
            ip: "203.0.113.9",
            version: 4,
            scope: "restricted",
        });
        expect(readVisitorRequest("8.8.8.8", CHROME).address?.scope).toBe("public");
        expect(readVisitorRequest("2606:4700:4700::1111", CHROME).address?.version).toBe(6);
        expect(readVisitorRequest("::1", CHROME).address?.scope).toBe("restricted");
    });

    test("keeps a value the proxy reported that is not an address, marked invalid", () => {
        expect(readVisitorRequest("unknown", CHROME).address).toEqual({
            ip: "unknown",
            version: null,
            scope: "invalid",
        });
    });

    test("no address at all is null, not an empty string", () => {
        expect(readVisitorRequest(undefined, CHROME).address).toBeNull();
    });

    test("reads every field in order, trimming values and nulling absent or blank ones", () => {
        const details = readVisitorRequest(
            "8.8.8.8",
            new Headers({ ...Object.fromEntries(CHROME), referer: "   " }),
        ).details;

        expect(details.map(({ field }) => field)).toEqual([
            "userAgent",
            "language",
            "encoding",
            "referer",
            "brands",
            "platform",
            "mobile",
            "doNotTrack",
            "globalPrivacyControl",
        ]);
        expect(details.find(({ field }) => field === "globalPrivacyControl")?.value).toBe("1");
        expect(details.find(({ field }) => field === "referer")?.value).toBeNull();
        expect(details.find(({ field }) => field === "doNotTrack")?.value).toBeNull();
        expect(details.find(({ field }) => field === "platform")).toEqual({
            field: "platform",
            header: "sec-ch-ua-platform",
            value: '"Linux"',
        });
    });
});

describe("command-line output", () => {
    test("plain text is the address and a newline", () => {
        expect(toCliText(readVisitorRequest("8.8.8.8", CHROME))).toBe("8.8.8.8\n");
        expect(toCliText(readVisitorRequest(undefined, CHROME))).toBeNull();
    });

    test("JSON carries the address, its family and every field", () => {
        const json = toCliJson(readVisitorRequest("8.8.8.8", CHROME));

        expect(json.ip).toBe("8.8.8.8");
        expect(json.version).toBe(4);
        expect(json.language).toBe("en-US,en;q=0.9");
        expect(json.referer).toBeNull();
        expect(Object.keys(json)).toHaveLength(11);
    });

    test("an unknown format degrades to the default instead of failing", () => {
        expect(cliQuerySchema.parse({ format: "json" }).format).toBe("json");
        expect(cliQuerySchema.parse({ format: "xml" }).format).toBeUndefined();
        expect(cliQuerySchema.parse({}).format).toBeUndefined();
    });
});
