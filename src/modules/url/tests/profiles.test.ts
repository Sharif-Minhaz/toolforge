import { describe, expect, test } from "bun:test";

import { keepsCharacterRaw } from "@/modules/url/domain/profiles";
import { URL_ENCODE_PROFILES, type UrlEncodeProfile } from "@/modules/url/types";

/** Alphanumerics and RFC 3986's unreserved marks survive every profile. */
const ALWAYS_RAW = ["a", "Z", "0", "9", "-", ".", "_"];

type Expectation = {
    readonly character: string;
    readonly component: boolean;
    readonly uri: boolean;
    readonly form: boolean;
};

const EXPECTATIONS: readonly Expectation[] = [
    { character: "~", component: true, uri: true, form: false },
    { character: "*", component: false, uri: true, form: true },
    { character: "!", component: false, uri: true, form: false },
    { character: "'", component: false, uri: true, form: false },
    { character: "(", component: false, uri: true, form: false },
    { character: ")", component: false, uri: true, form: false },
    { character: "/", component: false, uri: true, form: false },
    { character: "?", component: false, uri: true, form: false },
    { character: "#", component: false, uri: true, form: false },
    { character: "&", component: false, uri: true, form: false },
    { character: "=", component: false, uri: true, form: false },
    { character: "+", component: false, uri: true, form: false },
    { character: ":", component: false, uri: true, form: false },
    { character: "@", component: false, uri: true, form: false },
    { character: "[", component: false, uri: true, form: false },
    { character: "]", component: false, uri: true, form: false },
    { character: " ", component: false, uri: false, form: false },
    { character: "%", component: false, uri: false, form: false },
    { character: '"', component: false, uri: false, form: false },
    { character: "<", component: false, uri: false, form: false },
    { character: ">", component: false, uri: false, form: false },
    { character: "\\", component: false, uri: false, form: false },
    { character: "^", component: false, uri: false, form: false },
    { character: "`", component: false, uri: false, form: false },
    { character: "{", component: false, uri: false, form: false },
    { character: "|", component: false, uri: false, form: false },
    { character: "}", component: false, uri: false, form: false },
];

describe("keepsCharacterRaw", () => {
    for (const character of ALWAYS_RAW) {
        for (const profile of URL_ENCODE_PROFILES) {
            test(`keeps ${character} raw under ${profile}`, () => {
                expect(keepsCharacterRaw(profile, character)).toBe(true);
            });
        }
    }

    for (const expectation of EXPECTATIONS) {
        for (const profile of URL_ENCODE_PROFILES) {
            const expected = expectation[profile];

            test(`${expected ? "keeps" : "encodes"} ${expectation.character} under ${profile}`, () => {
                expect(keepsCharacterRaw(profile, expectation.character)).toBe(expected);
            });
        }
    }

    test("never keeps the escape marker itself, whatever the profile", () => {
        for (const profile of URL_ENCODE_PROFILES) {
            expect(keepsCharacterRaw(profile, "%")).toBe(false);
        }
    });

    test("reports non-ASCII characters as needing an escape", () => {
        const profile: UrlEncodeProfile = "uri";

        expect(keepsCharacterRaw(profile, "é")).toBe(false);
        expect(keepsCharacterRaw(profile, "ল")).toBe(false);
    });
});
