import { describe, expect, test } from "bun:test";

import { readRdapDate, toNetworkInfo } from "@/modules/tools/domain/rdap";

describe("readRdapDate", () => {
    test("normalises an offset date to UTC", () => {
        expect(readRdapDate("2026-08-14T04:00:00+02:00")).toBe("2026-08-14T02:00:00.000Z");
    });

    test("supplies the missing designator rather than letting the host guess", () => {
        // A zone-less string would be read against whichever machine parsed it,
        // so the server and the reader would disagree about the same registry.
        expect(readRdapDate("2026-08-14T04:00:00")).toBe("2026-08-14T04:00:00.000Z");
    });

    test("returns null for junk and for nothing", () => {
        expect(readRdapDate("not a date")).toBeNull();
        expect(readRdapDate(undefined)).toBeNull();
        expect(readRdapDate("   ")).toBeNull();
    });
});

describe("toNetworkInfo", () => {
    test("names the network and its holder", () => {
        expect(
            toNetworkInfo({
                name: "GOGL",
                country: "us",
                entities: [
                    {
                        roles: ["registrant"],
                        vcardArray: ["vcard", [["fn", {}, "text", "Google LLC"]]],
                    },
                ],
            }),
        ).toEqual({ network: "GOGL", org: "Google LLC", country: "US" });
    });

    test("falls back through the roles registries actually publish", () => {
        expect(
            toNetworkInfo({
                entities: [
                    {
                        roles: ["technical"],
                        vcardArray: ["vcard", [["fn", {}, "text", "Some NOC"]]],
                    },
                ],
            }),
        ).toEqual({ network: null, org: "Some NOC", country: null });
    });
});
