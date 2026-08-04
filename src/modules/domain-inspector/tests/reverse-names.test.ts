import { describe, expect, test } from "bun:test";

import { cymruOriginName, reverseArpaName } from "@/modules/domain-inspector/domain/reverse-names";

// Moved here with the code when the address arithmetic underneath was
// lifted to `tools/domain/ip.ts` for the Port Scanner. The assertions are
// unchanged: a refactor that edits them is a behaviour change in disguise.
describe("reverse names", () => {
    test("builds an in-addr.arpa name", () => {
        expect(reverseArpaName("8.8.4.4")).toBe("4.4.8.8.in-addr.arpa");
    });

    test("builds a nibble-form ip6.arpa name", () => {
        expect(reverseArpaName("2001:db8::1")).toBe(
            "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa",
        );
    });

    test("builds the Cymru origin name for IPv4", () => {
        expect(cymruOriginName("8.8.4.4")).toBe("4.4.8.8.origin.asn.cymru.com");
    });

    test("builds the Cymru origin name for IPv6", () => {
        expect(cymruOriginName("2001:db8::1")).toEndWith(".origin6.asn.cymru.com");
    });

    test("returns null for something that is not an address", () => {
        expect(reverseArpaName("example.com")).toBeNull();
        expect(cymruOriginName("example.com")).toBeNull();
    });
});
