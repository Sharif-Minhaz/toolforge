import {
    PERMISSION_CLASSES,
    PERMISSIONS,
    SPECIAL_BITS,
    type ChmodDescription,
    type Permission,
    type PermissionClass,
    type SpecialBit,
} from "../types";
import { DEFAULT_PATH } from "./constants";

/** `owner`/`read` → `0o400`, `others`/`execute` → `0o001`. */
export function permissionMask(permissionClass: PermissionClass, permission: Permission): number {
    const shift = 3 * (2 - PERMISSION_CLASSES.indexOf(permissionClass));

    return (4 >> PERMISSIONS.indexOf(permission)) << shift;
}

/** `setuid` → `0o4000`, `setgid` → `0o2000`, `sticky` → `0o1000`. */
export function specialMask(bit: SpecialBit): number {
    return (4 >> SPECIAL_BITS.indexOf(bit)) << 9;
}

/** The special bit that shares a class's execute slot in `ls -l`. */
const SLOT_SPECIAL: Record<PermissionClass, SpecialBit> = {
    owner: "setuid",
    group: "setgid",
    others: "sticky",
};

/** `s` for the two set-ID bits, `t` for sticky. */
const SPECIAL_LETTER: Record<SpecialBit, "s" | "t"> = { setuid: "s", setgid: "s", sticky: "t" };

const PERMISSION_LETTER: Record<Permission, "r" | "w" | "x"> = {
    read: "r",
    write: "w",
    execute: "x",
};

const CLASS_LETTER: Record<PermissionClass, "u" | "g" | "o"> = {
    owner: "u",
    group: "g",
    others: "o",
};

function has(mode: number, mask: number): boolean {
    return (mode & mask) !== 0;
}

/** The digit for one class: `owner` of `0o754` is `7`. */
export function classDigit(mode: number, permissionClass: PermissionClass): number {
    return (mode >> (3 * (2 - PERMISSION_CLASSES.indexOf(permissionClass)))) & 7;
}

/** `755`, and `4755` only when a special bit is set — what `stat -c %a` prints, padded to three. */
export function formatOctal(mode: number): string {
    return mode.toString(8).padStart(3, "0");
}

/**
 * The nine permission characters of `ls -l`. A special bit replaces its slot's
 * `x`: lowercase when execute is also set, uppercase when it is not.
 */
export function formatSymbolic(mode: number): string {
    return PERMISSION_CLASSES.map((permissionClass) => {
        const read = has(mode, permissionMask(permissionClass, "read")) ? "r" : "-";
        const write = has(mode, permissionMask(permissionClass, "write")) ? "w" : "-";
        const execute = has(mode, permissionMask(permissionClass, "execute"));
        const special = SLOT_SPECIAL[permissionClass];

        if (!has(mode, specialMask(special))) {
            return `${read}${write}${execute ? "x" : "-"}`;
        }

        const letter = SPECIAL_LETTER[special];

        return `${read}${write}${execute ? letter : letter.toUpperCase()}`;
    }).join("");
}

/**
 * `u=rwx,g=rx,o=rx` — one `=` clause per class, so it sets the whole mode
 * rather than adjusting the one already there. An empty clause (`o=`) clears
 * that class, and the special bits ride in the clause GNU `chmod` files them
 * under: `s` with `u` or `g`, `t` with `o`.
 */
export function formatAssignment(mode: number): string {
    return PERMISSION_CLASSES.map((permissionClass) => {
        const letters: string[] = PERMISSIONS.filter((permission) =>
            has(mode, permissionMask(permissionClass, permission)),
        ).map((permission) => PERMISSION_LETTER[permission]);
        const special = SLOT_SPECIAL[permissionClass];

        if (has(mode, specialMask(special))) {
            letters.push(SPECIAL_LETTER[special]);
        }

        return `${CLASS_LETTER[permissionClass]}=${letters.join("")}`;
    }).join(",");
}

/**
 * Written verbatim, not quoted: what goes in the path field is a shell word the
 * reader is typing — `*.sh` and `~/bin` mean what they say only unquoted.
 */
export function formatCommand(mode: number, path: string): string {
    const target = path.trim();

    return `chmod ${formatOctal(mode)} ${target.length > 0 ? target : DEFAULT_PATH}`;
}

/** Others may write. Covers 777, but also 666 and 1777 — the one rule, not a list. */
export function isWorldWritable(mode: number): boolean {
    return has(mode, permissionMask("others", "write"));
}

/** Every output the page and the MCP adapter show, from one mode. */
export function describeMode(mode: number, path = ""): ChmodDescription {
    return {
        mode,
        octal: formatOctal(mode),
        symbolic: formatSymbolic(mode),
        assignment: formatAssignment(mode),
        command: formatCommand(mode, path),
        worldWritable: isWorldWritable(mode),
    };
}
