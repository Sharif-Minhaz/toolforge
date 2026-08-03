import { describe, expect, test } from "bun:test";

import {
    readRdapDate,
    toDomainRegistration,
    toNetworkInfo,
    type RdapDomainPayload,
} from "@/modules/domain-inspector/domain/rdap";

const NOW = new Date("2026-08-04T00:00:00.000Z");

const FULL_DOMAIN: RdapDomainPayload = {
    handle: "2336799_DOMAIN_COM-VRSN",
    ldhName: "example.com",
    status: ["client transfer prohibited", "server delete prohibited"],
    events: [
        { eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" },
        { eventAction: "last changed", eventDate: "2026-05-02T09:15:00Z" },
        { eventAction: "expiration", eventDate: "2026-08-14T04:00:00Z" },
    ],
    nameservers: [{ ldhName: "A.IANA-SERVERS.NET" }, { ldhName: "B.IANA-SERVERS.NET" }],
    secureDNS: { delegationSigned: true },
    entities: [
        {
            roles: ["registrar"],
            publicIds: [{ type: "IANA Registrar ID", identifier: "376" }],
            vcardArray: [
                "vcard",
                [
                    ["version", {}, "text", "4.0"],
                    ["fn", {}, "text", "Example Registrar, Inc."],
                    ["url", {}, "uri", "https://registrar.example"],
                ],
            ],
            entities: [
                {
                    roles: ["abuse"],
                    vcardArray: [
                        "vcard",
                        [
                            ["fn", {}, "text", "Abuse Desk"],
                            ["email", {}, "text", "abuse@registrar.example"],
                        ],
                    ],
                },
            ],
        },
        {
            roles: ["registrant"],
            vcardArray: [
                "vcard",
                [["adr", { cc: "gb" }, "text", ["", "", "", "", "", "", "United Kingdom"]]],
            ],
        },
    ],
};

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

describe("toDomainRegistration", () => {
    const registration = toDomainRegistration({
        payload: FULL_DOMAIN,
        source: "rdap.verisign.com",
        now: NOW,
    });

    test("pulls the registrar out of its jCard", () => {
        expect(registration.registrar).toBe("Example Registrar, Inc.");
        expect(registration.registrarUrl).toBe("https://registrar.example");
        expect(registration.registrarIanaId).toBe("376");
    });

    test("finds the abuse contact nested inside the registrar entity", () => {
        expect(registration.abuseEmail).toBe("abuse@registrar.example");
    });

    test("maps the three events people actually look for", () => {
        expect(registration).toMatchObject({
            registeredAt: "1995-08-14T04:00:00.000Z",
            updatedAt: "2026-05-02T09:15:00.000Z",
            expiresAt: "2026-08-14T04:00:00.000Z",
        });
    });

    test("counts the days left against the clock it was given", () => {
        expect(registration.daysUntilExpiry).toBe(10);
    });

    test("reports a lapsed registration as a negative count", () => {
        const lapsed = toDomainRegistration({
            payload: FULL_DOMAIN,
            source: null,
            now: new Date("2026-09-14T04:00:00.000Z"),
        });

        expect(lapsed.daysUntilExpiry).toBe(-31);
    });

    test("lower-cases nameservers and keeps their order", () => {
        expect(registration.nameservers).toEqual(["a.iana-servers.net", "b.iana-servers.net"]);
    });

    test("reads the country from the address parameter", () => {
        expect(registration.registrantCountry).toBe("GB");
    });

    test("falls back to the seventh address component when there is no parameter", () => {
        const withoutCc = toDomainRegistration({
            payload: {
                entities: [
                    {
                        roles: ["registrant"],
                        vcardArray: [
                            "vcard",
                            [["adr", {}, "text", ["", "", "", "", "", "", "Bangladesh"]]],
                        ],
                    },
                ],
            },
            source: null,
            now: NOW,
        });

        expect(withoutCc.registrantCountry).toBe("Bangladesh");
    });

    test("carries the EPP status codes through untranslated", () => {
        expect(registration.statuses).toEqual([
            "client transfer prohibited",
            "server delete prohibited",
        ]);
    });

    test("survives a payload with nothing in it", () => {
        const empty = toDomainRegistration({ payload: {}, source: null, now: NOW });

        expect(empty).toEqual({
            handle: null,
            registrar: null,
            registrarIanaId: null,
            registeredAt: null,
            updatedAt: null,
            expiresAt: null,
            daysUntilExpiry: null,
            statuses: [],
            nameservers: [],
            dnssec: false,
            registrantCountry: null,
            abuseEmail: null,
            registrarUrl: null,
            source: null,
        });
    });

    test("survives a vcardArray that is not a jCard at all", () => {
        const broken = toDomainRegistration({
            payload: { entities: [{ roles: ["registrar"], vcardArray: ["vcard"] }] },
            source: null,
            now: NOW,
        });

        expect(broken.registrar).toBeNull();
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
