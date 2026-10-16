import type { KeyLabelSystem, LayoutFamily } from "../types";

/**
 * What is printed on each cap. Cap names are data, not copy — "Shift" and
 * "Ctrl" are printed in English on keyboards sold everywhere, Bangladesh
 * included — so they live here and not in the message catalogue.
 *
 * The defaults are the US layout. Where the browser can read the reader's own
 * layout (`navigator.keyboard.getLayoutMap`, Chromium only) the character keys
 * are relabelled from it, so a German board shows Z where a US one shows Y.
 * Testing does not depend on it either way: every key is matched by its
 * physical `code`, which is the same whatever layout is active.
 */

export type KeyLabel = {
    readonly main: string;
    /** The shifted character, printed above the main one. */
    readonly shifted?: string;
};

const NAMED: Readonly<Record<string, string>> = {
    Escape: "Esc",
    Backspace: "Backspace",
    Tab: "Tab",
    CapsLock: "Caps",
    Enter: "Enter",
    ShiftLeft: "Shift",
    ShiftRight: "Shift",
    ControlLeft: "Ctrl",
    ControlRight: "Ctrl",
    MetaLeft: "Win",
    MetaRight: "Win",
    AltLeft: "Alt",
    AltRight: "Alt",
    ContextMenu: "Menu",
    Space: "Space",
    PrintScreen: "PrtSc",
    ScrollLock: "ScrLk",
    Pause: "Pause",
    Insert: "Ins",
    Delete: "Del",
    Home: "Home",
    End: "End",
    PageUp: "PgUp",
    PageDown: "PgDn",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    NumLock: "Num",
    NumpadDivide: "/",
    NumpadMultiply: "*",
    NumpadSubtract: "−",
    NumpadAdd: "+",
    NumpadEnter: "Enter",
    NumpadDecimal: ".",
    IntlBackslash: "\\",
};

const MAC: Readonly<Record<string, string>> = {
    MetaLeft: "⌘ cmd",
    MetaRight: "⌘ cmd",
    AltLeft: "⌥ opt",
    AltRight: "⌥ opt",
    ControlLeft: "⌃ ctrl",
    ControlRight: "⌃ ctrl",
    Backspace: "delete",
    Enter: "return",
    CapsLock: "caps",
    Escape: "esc",
};

const PUNCTUATION: Readonly<Record<string, KeyLabel>> = {
    Backquote: { main: "`", shifted: "~" },
    Minus: { main: "-", shifted: "_" },
    Equal: { main: "=", shifted: "+" },
    BracketLeft: { main: "[", shifted: "{" },
    BracketRight: { main: "]", shifted: "}" },
    Backslash: { main: "\\", shifted: "|" },
    Semicolon: { main: ";", shifted: ":" },
    Quote: { main: "'", shifted: '"' },
    Comma: { main: ",", shifted: "<" },
    Period: { main: ".", shifted: ">" },
    Slash: { main: "/", shifted: "?" },
};

const DIGIT_SHIFTED = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];

/** Keys whose cap shows a character from the active layout rather than a name. */
export function isCharacterKey(code: string): boolean {
    return /^(Key[A-Z]|Digit\d)$/.test(code) || code in PUNCTUATION || code === "IntlBackslash";
}

export function keyLabel(
    code: string,
    system: KeyLabelSystem,
    layoutMap: ReadonlyMap<string, string> | null = null,
): KeyLabel {
    const fromLayout = layoutMap?.get(code);

    if (fromLayout !== undefined && fromLayout.length > 0 && isCharacterKey(code)) {
        return { main: fromLayout.toLocaleUpperCase() };
    }

    if (system === "mac" && code in MAC) {
        return { main: MAC[code] };
    }

    if (code in NAMED) {
        return { main: NAMED[code] };
    }

    if (code in PUNCTUATION) {
        return PUNCTUATION[code];
    }

    const letter = /^Key([A-Z])$/.exec(code);

    if (letter !== null) {
        return { main: letter[1] };
    }

    const digit = /^Digit(\d)$/.exec(code);

    if (digit !== null) {
        const value = Number(digit[1]);

        return { main: digit[1], shifted: DIGIT_SHIFTED[(value + 9) % 10] };
    }

    const numpad = /^Numpad(\d)$/.exec(code);

    if (numpad !== null) {
        return { main: numpad[1] };
    }

    // F1–F24, media keys and anything newer: the code is the clearest name.
    return { main: code.replace(/^Audio|^Media|^Browser|^Launch/, "") || code };
}

/**
 * The layout family the active layout belongs to, read from four positions
 * that tell the common Latin layouts apart. A layout that prints something
 * else there — Bangla, Russian, Greek — is `other`, which says nothing about
 * whether the keys work.
 */
export function detectLayoutFamily(layoutMap: ReadonlyMap<string, string>): LayoutFamily {
    const at = (code: string) => layoutMap.get(code)?.toLowerCase();
    const q = at("KeyQ");
    const w = at("KeyW");
    const y = at("KeyY");
    const e = at("KeyE");

    if (q === "q" && w === "w" && y === "y" && e === "e") {
        return "qwerty";
    }

    if (q === "q" && w === "w" && y === "z") {
        return "qwertz";
    }

    if (q === "a" && w === "z") {
        return "azerty";
    }

    if (q === "'" && w === ",") {
        return "dvorak";
    }

    if (q === "q" && w === "w" && e === "f") {
        return "colemak";
    }

    return "other";
}

/**
 * Caps' text is a third of a key unit, so one unit is about three em wide once
 * the inset and padding are taken off — room for three or four characters.
 * Longer names (PrtSc, Pause, Home) are shrunk to fit rather than cut to
 * "Ho…", down to a floor below which a cap would be unreadable anyway.
 */
const EM_PER_UNIT = 3;
const PADDING_EM = 0.4;
const EM_PER_CHARACTER = 0.72;
const MIN_LABEL_SCALE = 0.55;

export function labelScale(width: number, label: string): number {
    const room = width * EM_PER_UNIT - PADDING_EM;
    const needed = [...label].length * EM_PER_CHARACTER;

    return Math.min(1, Math.max(MIN_LABEL_SCALE, room / needed));
}
