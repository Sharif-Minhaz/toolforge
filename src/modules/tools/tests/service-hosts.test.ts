import { describe, expect, test } from "bun:test";

import {
    isServiceHost,
    parseServiceDomain,
    routeServiceHost,
    serviceBase,
} from "@/modules/tools/domain/service-hosts";

const DOMAIN = "minhaz.bond";
const MOCK = { subdomain: "mock", prefix: "/m" };
const SHORT = { subdomain: "s", prefix: "/s" };
const SITE = "https://toolforge.minhaz.bond";

describe("parseServiceDomain", () => {
    test("blank means subdomains are off", () => {
        expect(parseServiceDomain(undefined)).toBeNull();
        expect(parseServiceDomain("  ")).toBeNull();
    });

    test("normalises case and stray dots", () => {
        expect(parseServiceDomain(" .Minhaz.Bond. ")).toBe(DOMAIN);
    });
});

describe("serviceBase", () => {
    test("uses the subdomain when the page was served inside the domain", () => {
        expect(serviceBase(MOCK, SITE, "toolforge.minhaz.bond", DOMAIN)).toBe(
            "https://mock.minhaz.bond",
        );
        expect(serviceBase(MOCK, SITE, "minhaz.bond:443", DOMAIN)).toBe("https://mock.minhaz.bond");
    });

    test("falls back to the path form on any other host", () => {
        expect(serviceBase(MOCK, SITE, "toolforge.vercel.app", DOMAIN)).toBe(`${SITE}/m`);
        expect(serviceBase(MOCK, "http://localhost:3000/", "localhost:3000", DOMAIN)).toBe(
            "http://localhost:3000/m",
        );
    });

    test("a host that merely ends in the domain's letters is outside it", () => {
        expect(serviceBase(MOCK, SITE, "evilminhaz.bond", DOMAIN)).toBe(`${SITE}/m`);
    });

    test("falls back when subdomains are off or the host is unknown", () => {
        expect(serviceBase(MOCK, SITE, "toolforge.minhaz.bond", null)).toBe(`${SITE}/m`);
        expect(serviceBase(MOCK, SITE, null, DOMAIN)).toBe(`${SITE}/m`);
    });
});

describe("routeServiceHost", () => {
    const services = [MOCK, SHORT];

    test("rewrites a service subdomain onto its path prefix", () => {
        expect(routeServiceHost("mock.minhaz.bond", "/abc/users/1", services, DOMAIN)).toBe(
            "/m/abc/users/1",
        );
        expect(routeServiceHost("S.minhaz.bond:443", "/summer", services, DOMAIN)).toBe(
            "/s/summer",
        );
        expect(routeServiceHost("mock.minhaz.bond", "/", services, DOMAIN)).toBe("/m");
    });

    test("leaves every other host alone", () => {
        expect(routeServiceHost("toolforge.minhaz.bond", "/m/abc", services, DOMAIN)).toBeNull();
        expect(routeServiceHost("mock.vercel.app", "/abc", services, DOMAIN)).toBeNull();
        expect(routeServiceHost("mock.minhaz.bond", "/abc", services, null)).toBeNull();
        expect(routeServiceHost(null, "/abc", services, DOMAIN)).toBeNull();
    });
});

describe("isServiceHost", () => {
    test("matches only the exact subdomain", () => {
        expect(isServiceHost("s.minhaz.bond", SHORT, DOMAIN)).toBe(true);
        expect(isServiceHost("x.s.minhaz.bond", SHORT, DOMAIN)).toBe(false);
        expect(isServiceHost("s.minhaz.bond", SHORT, null)).toBe(false);
    });
});
