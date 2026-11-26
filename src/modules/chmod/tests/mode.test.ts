import { describe, expect, test } from "bun:test";

import {
    classDigit,
    describeMode,
    formatAssignment,
    formatCommand,
    formatOctal,
    formatSymbolic,
    isWorldWritable,
    permissionMask,
    specialMask,
} from "@/modules/chmod/domain/mode";

describe("masks", () => {
    test("place each permission at its octal weight", () => {
        expect(permissionMask("owner", "read")).toBe(0o400);
        expect(permissionMask("owner", "execute")).toBe(0o100);
        expect(permissionMask("group", "write")).toBe(0o020);
        expect(permissionMask("others", "execute")).toBe(0o001);
        expect(specialMask("setuid")).toBe(0o4000);
        expect(specialMask("setgid")).toBe(0o2000);
        expect(specialMask("sticky")).toBe(0o1000);
    });

    test("read one class's digit", () => {
        expect(classDigit(0o4751, "owner")).toBe(7);
        expect(classDigit(0o4751, "group")).toBe(5);
        expect(classDigit(0o4751, "others")).toBe(1);
    });
});

describe("formatters", () => {
    test("write three octal digits, four once a special bit is set", () => {
        expect(formatOctal(0o755)).toBe("755");
        expect(formatOctal(0o44)).toBe("044");
        expect(formatOctal(0)).toBe("000");
        expect(formatOctal(0o4755)).toBe("4755");
        expect(formatOctal(0o1000)).toBe("1000");
    });

    test("swap a special bit into the execute slot, upper case without execute", () => {
        expect(formatSymbolic(0o755)).toBe("rwxr-xr-x");
        expect(formatSymbolic(0o4755)).toBe("rwsr-xr-x");
        expect(formatSymbolic(0o4644)).toBe("rwSr--r--");
        expect(formatSymbolic(0o2755)).toBe("rwxr-sr-x");
        expect(formatSymbolic(0o1777)).toBe("rwxrwxrwt");
        expect(formatSymbolic(0o1776)).toBe("rwxrwxrwT");
        expect(formatSymbolic(0)).toBe("---------");
    });

    test("assign every class, empty clauses included", () => {
        expect(formatAssignment(0o755)).toBe("u=rwx,g=rx,o=rx");
        expect(formatAssignment(0o640)).toBe("u=rw,g=r,o=");
        expect(formatAssignment(0)).toBe("u=,g=,o=");
        expect(formatAssignment(0o4755)).toBe("u=rwxs,g=rx,o=rx");
        expect(formatAssignment(0o3000)).toBe("u=,g=s,o=t");
    });

    test("name the default path when none is given, and keep a typed one verbatim", () => {
        expect(formatCommand(0o755, "")).toBe("chmod 755 file");
        expect(formatCommand(0o755, "   ")).toBe("chmod 755 file");
        expect(formatCommand(0o600, " ~/.ssh/id_ed25519 ")).toBe("chmod 600 ~/.ssh/id_ed25519");
        expect(formatCommand(0o2775, "*.sh")).toBe("chmod 2775 *.sh");
    });

    test("flag any mode others can write, not only 777", () => {
        expect(isWorldWritable(0o777)).toBe(true);
        expect(isWorldWritable(0o666)).toBe(true);
        expect(isWorldWritable(0o1777)).toBe(true);
        expect(isWorldWritable(0o775)).toBe(false);
        expect(isWorldWritable(0o755)).toBe(false);
    });

    test("describe one mode every way at once", () => {
        expect(describeMode(0o755, "deploy.sh")).toEqual({
            mode: 0o755,
            octal: "755",
            symbolic: "rwxr-xr-x",
            assignment: "u=rwx,g=rx,o=rx",
            command: "chmod 755 deploy.sh",
            worldWritable: false,
        });
    });
});
