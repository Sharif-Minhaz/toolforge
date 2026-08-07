import { describe, expect, test } from "bun:test";

import { decodeCipher, decodeText, encodeCipher, encodeText } from "../domain/payload";

describe("decodeText", () => {
    test("reads UTF-8 by encoding the characters", () => {
        expect([...(decodeText("héllo", "utf-8") ?? [])]).toEqual([
            0x68, 0xc3, 0xa9, 0x6c, 0x6c, 0x6f,
        ]);
    });

    test("reads hex, whitespace and all", () => {
        expect([...(decodeText("de ad\nbe ef", "hex") ?? [])]).toEqual([0xde, 0xad, 0xbe, 0xef]);
    });

    test("reads base64", () => {
        expect([...(decodeText("aGk=", "base64") ?? [])]).toEqual([0x68, 0x69]);
    });

    test("returns null for hex with an odd length", () => {
        expect(decodeText("abc", "hex")).toBeNull();
    });

    test("returns null for characters neither alphabet has", () => {
        expect(decodeText("zz", "hex")).toBeNull();
        expect(decodeText("!!!!", "base64")).toBeNull();
    });
});

describe("encodeText", () => {
    test("writes hex in lower case", () => {
        expect(encodeText(new Uint8Array([0xde, 0xad]), "hex")).toBe("dead");
    });

    test("writes padded standard base64", () => {
        expect(encodeText(new Uint8Array([0x68, 0x69]), "base64")).toBe("aGk=");
    });

    test("writes UTF-8 back", () => {
        expect(encodeText(new Uint8Array([0x68, 0xc3, 0xa9]), "utf-8")).toBe("hé");
    });

    /**
     * The single most useful `null` in the module: it is what tells a reader
     * that an unauthenticated mode decrypted with the wrong key, since the
     * cipher itself will not.
     */
    test("returns null for bytes that are not UTF-8", () => {
        expect(encodeText(new Uint8Array([0xff, 0xfe, 0xfd]), "utf-8")).toBeNull();
    });

    test("never returns null for hex or base64, which render any bytes", () => {
        const bytes = new Uint8Array([0xff, 0xfe, 0xfd]);

        expect(encodeText(bytes, "hex")).toBe("fffefd");
        expect(encodeText(bytes, "base64")).toBe("//79");
    });
});

describe("the ciphertext side", () => {
    test("round-trips through hex", () => {
        const bytes = new Uint8Array([0x00, 0x7f, 0xff]);

        expect([...(decodeCipher(encodeCipher(bytes, "hex"), "hex") ?? [])]).toEqual([...bytes]);
    });

    test("round-trips through base64", () => {
        const bytes = new Uint8Array([0x00, 0x7f, 0xff]);

        expect([...(decodeCipher(encodeCipher(bytes, "base64"), "base64") ?? [])]).toEqual([
            ...bytes,
        ]);
    });

    test("reads a base64 payload that arrived wrapped", () => {
        expect(decodeCipher("aGVs\nbG8=", "base64")).not.toBeNull();
    });
});
