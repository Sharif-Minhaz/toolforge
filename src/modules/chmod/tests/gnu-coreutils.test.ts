import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { MAX_MODE } from "@/modules/chmod/domain/constants";
import { formatAssignment, formatOctal, formatSymbolic } from "@/modules/chmod/domain/mode";
import { parseOctalMode } from "@/modules/chmod/domain/parse";

/**
 * Pinned from GNU coreutils 9.4 on Linux, over all 4096 modes, so the tool is
 * checked against the program it describes rather than against itself.
 *
 * The digests cover every mode; the explicit rows beside them say which mode is
 * wrong when a digest stops matching.
 */

function sha256(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

function everyMode(line: (mode: number) => string): string {
    return Array.from({ length: MAX_MODE + 1 }, (_, mode) => `${line(mode)}\n`).join("");
}

describe("GNU stat", () => {
    /**
     * `for m in 0..7777: chmod <m> f && stat -c '%a %A' f` on a regular file.
     * `%a` is unpadded (`0`, `755`, `4755`); `%A` is the `ls -l` column, whose
     * first character is the file type.
     */
    const STAT_DIGEST = "127271f9007c4f705387f075ea472b3c000b59e3d5e3200318b5783ffe482668";

    test("prints the same symbolic string for every mode", () => {
        expect(sha256(everyMode((mode) => `${mode.toString(8)} -${formatSymbolic(mode)}`))).toBe(
            STAT_DIGEST,
        );
    });

    test.each([
        ["0", "----------"],
        ["7", "-------rwx"],
        ["644", "-rw-r--r--"],
        ["755", "-rwxr-xr-x"],
        ["1000", "---------T"],
        ["1777", "-rwxrwxrwt"],
        ["2644", "-rw-r-Sr--"],
        ["2755", "-rwxr-sr-x"],
        ["4000", "---S------"],
        ["4755", "-rwsr-xr-x"],
        ["6000", "---S--S---"],
        ["7777", "-rwsrwsrwt"],
    ])("chmod %s → %s", (octal, column) => {
        const parsed = parseOctalMode(octal);

        expect(parsed.ok).toBe(true);
        expect(parsed.ok && `-${formatSymbolic(parsed.mode)}`).toBe(column);
        expect(parsed.ok && formatOctal(parsed.mode)).toBe(octal.padStart(3, "0"));
    });
});

describe("GNU chmod", () => {
    /**
     * `<octal> <assignment>` for every mode. Each assignment was applied with
     * `chmod <assignment> f` to a file first at `7777` and then at `0`, and
     * `stat -c %a` read back exactly `<octal>` both times — so the string sets
     * the whole mode, whatever the file had before.
     */
    const ASSIGNMENT_DIGEST = "2599e2a820f4de375fb11c18aca2670c27cff24cee85ddd255d98efc1106dfbd";

    test("applies every assignment string to exactly its own mode", () => {
        expect(sha256(everyMode((mode) => `${formatOctal(mode)} ${formatAssignment(mode)}`))).toBe(
            ASSIGNMENT_DIGEST,
        );
    });

    test.each([
        [0o000, "u=,g=,o="],
        [0o001, "u=,g=,o=x"],
        [0o4000, "u=s,g=,o="],
        [0o2000, "u=,g=s,o="],
        [0o1000, "u=,g=,o=t"],
        [0o1777, "u=rwx,g=rwx,o=rwxt"],
        [0o7777, "u=rwxs,g=rwxs,o=rwxt"],
    ])("mode %o ← %s", (mode, assignment) => {
        expect(formatAssignment(mode)).toBe(assignment);
    });
});
