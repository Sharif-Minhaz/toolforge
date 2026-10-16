import type { KeyboardLayout, KeyboardSize, KeyboardStandard, LayoutKey } from "../types";

/**
 * Every board the tester can draw, built from rows rather than written out
 * key by key: each size is the same alphanumeric block with a different frame
 * around it, and ISO is the same block with three keys moved.
 *
 * Positions are in key units. A number in a row is a gap; a tuple is a key
 * `[code, width, height]`, defaulting to one by one.
 */

type Cell = number | readonly [string | null, number?, number?];

/** The vertical gap between the function row and the rest, as on real boards. */
const F_ROW_GAP = 0.25;

function row(y: number, x0: number, cells: readonly Cell[]): LayoutKey[] {
    const keys: LayoutKey[] = [];
    let x = x0;

    for (const cell of cells) {
        if (typeof cell === "number") {
            x += cell;
            continue;
        }

        const [code, w = 1, h = 1] = cell;

        keys.push({ code, x, y, w, h });
        x += w;
    }

    return keys;
}

const keysOf = (...codes: string[]): Cell[] => codes.map((code) => [code] as const);

const DIGITS = keysOf(
    "Digit1",
    "Digit2",
    "Digit3",
    "Digit4",
    "Digit5",
    "Digit6",
    "Digit7",
    "Digit8",
    "Digit9",
    "Digit0",
    "Minus",
    "Equal",
);
const TOP_LETTERS = keysOf(
    "KeyQ",
    "KeyW",
    "KeyE",
    "KeyR",
    "KeyT",
    "KeyY",
    "KeyU",
    "KeyI",
    "KeyO",
    "KeyP",
    "BracketLeft",
    "BracketRight",
);
const HOME_LETTERS = keysOf(
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyF",
    "KeyG",
    "KeyH",
    "KeyJ",
    "KeyK",
    "KeyL",
    "Semicolon",
    "Quote",
);
const BOTTOM_LETTERS = keysOf(
    "KeyZ",
    "KeyX",
    "KeyC",
    "KeyV",
    "KeyB",
    "KeyN",
    "KeyM",
    "Comma",
    "Period",
    "Slash",
);
const F_KEYS = (from: number, to: number) =>
    keysOf(...Array.from({ length: to - from + 1 }, (_, index) => `F${from + index}`));

/**
 * The four alphanumeric rows below the number row's first key. The ISO block
 * moves Backslash down beside Enter, folds Enter across two rows and splits
 * the left Shift for `IntlBackslash`.
 */
function letterRows(
    y: number,
    standard: KeyboardStandard,
    rightShift: number,
    firstKey: "Backquote" | "Escape",
): LayoutKey[] {
    const number = row(y, 0, [[firstKey], ...DIGITS, ["Backspace", 2]]);

    if (standard === "ansi") {
        return [
            ...number,
            ...row(y + 1, 0, [["Tab", 1.5], ...TOP_LETTERS, ["Backslash", 1.5]]),
            ...row(y + 2, 0, [["CapsLock", 1.75], ...HOME_LETTERS, ["Enter", 2.25]]),
            ...row(y + 3, 0, [["ShiftLeft", 2.25], ...BOTTOM_LETTERS, ["ShiftRight", rightShift]]),
        ];
    }

    return [
        ...number,
        ...row(y + 1, 0, [["Tab", 1.5], ...TOP_LETTERS]),
        { code: "Enter", x: 13.5, y: y + 1, w: 1.5, h: 2, shape: "isoEnter" },
        ...row(y + 2, 0, [["CapsLock", 1.75], ...HOME_LETTERS, ["Backslash"]]),
        ...row(y + 3, 0, [
            ["ShiftLeft", 1.25],
            ["IntlBackslash"],
            ...BOTTOM_LETTERS,
            ["ShiftRight", rightShift],
        ]),
    ];
}

const FULL_BOTTOM: Cell[] = [
    ["ControlLeft", 1.25],
    ["MetaLeft", 1.25],
    ["AltLeft", 1.25],
    ["Space", 6.25],
    ["AltRight", 1.25],
    ["MetaRight", 1.25],
    ["ContextMenu", 1.25],
    ["ControlRight", 1.25],
];

/** Fn takes the right Windows key's place; nothing reports it, so it has no code. */
const COMPACT_BOTTOM: Cell[] = [
    ["ControlLeft", 1.25],
    ["MetaLeft", 1.25],
    ["AltLeft", 1.25],
    ["Space", 6.25],
    ["AltRight"],
    [null],
    ["ControlRight"],
];

function tenkeyless(standard: KeyboardStandard): LayoutKey[] {
    const y = 1 + F_ROW_GAP;

    return [
        ...row(0, 0, [["Escape"], 1, ...F_KEYS(1, 4), 0.5, ...F_KEYS(5, 8), 0.5, ...F_KEYS(9, 12)]),
        ...row(0, 15.25, keysOf("PrintScreen", "ScrollLock", "Pause")),
        ...letterRows(y, standard, 2.75, "Backquote"),
        ...row(y + 4, 0, FULL_BOTTOM),
        ...row(y, 15.25, keysOf("Insert", "Home", "PageUp")),
        ...row(y + 1, 15.25, keysOf("Delete", "End", "PageDown")),
        ...row(y + 3, 16.25, keysOf("ArrowUp")),
        ...row(y + 4, 15.25, keysOf("ArrowLeft", "ArrowDown", "ArrowRight")),
    ];
}

function numpad(): LayoutKey[] {
    const y = 1 + F_ROW_GAP;
    const x = 18.5;

    return [
        ...row(y, x, keysOf("NumLock", "NumpadDivide", "NumpadMultiply", "NumpadSubtract")),
        ...row(y + 1, x, [...keysOf("Numpad7", "Numpad8", "Numpad9"), ["NumpadAdd", 1, 2]]),
        ...row(y + 2, x, keysOf("Numpad4", "Numpad5", "Numpad6")),
        ...row(y + 3, x, [...keysOf("Numpad1", "Numpad2", "Numpad3"), ["NumpadEnter", 1, 2]]),
        ...row(y + 4, x, [["Numpad0", 2], ["NumpadDecimal"]]),
    ];
}

/** A 75% board: the function row kept, the navigation cluster folded into one column. */
function seventyFive(standard: KeyboardStandard): LayoutKey[] {
    const y = 1 + F_ROW_GAP;

    return [
        ...row(0, 0, [["Escape"], ...F_KEYS(1, 12), ...keysOf("PrintScreen", "Pause", "Delete")]),
        ...letterRows(y, standard, 1.75, "Backquote"),
        ...row(y + 4, 0, [...COMPACT_BOTTOM, ...keysOf("ArrowLeft", "ArrowDown", "ArrowRight")]),
        ...row(y, 15, keysOf("Home")),
        ...row(y + 1, 15, keysOf("PageUp")),
        ...row(y + 2, 15, keysOf("PageDown")),
        ...row(y + 3, 14, keysOf("ArrowUp", "End")),
    ];
}

/** A 65% board: no function row, Escape where the backtick was, arrows kept. */
function sixtyFive(standard: KeyboardStandard): LayoutKey[] {
    return [
        ...letterRows(0, standard, 1.75, "Escape"),
        ...row(4, 0, [...COMPACT_BOTTOM, ...keysOf("ArrowLeft", "ArrowDown", "ArrowRight")]),
        ...row(0, 15, keysOf("Delete")),
        ...row(1, 15, keysOf("PageUp")),
        ...row(2, 15, keysOf("PageDown")),
        ...row(3, 14, keysOf("ArrowUp", "End")),
    ];
}

/** A 60% board: the alphanumeric block and nothing else; arrows live behind Fn. */
function sixty(standard: KeyboardStandard): LayoutKey[] {
    return [
        ...letterRows(0, standard, 2.75, "Escape"),
        ...row(4, 0, [
            ["ControlLeft", 1.25],
            ["MetaLeft", 1.25],
            ["AltLeft", 1.25],
            ["Space", 6.25],
            ["AltRight", 1.25],
            [null, 1.25],
            ["ContextMenu", 1.25],
            ["ControlRight", 1.25],
        ]),
    ];
}

function keysFor(size: KeyboardSize, standard: KeyboardStandard): LayoutKey[] {
    switch (size) {
        case "full":
            return [...tenkeyless(standard), ...numpad()];
        case "tkl":
            return tenkeyless(standard);
        case "75":
            return seventyFive(standard);
        case "65":
            return sixtyFive(standard);
        case "60":
            return sixty(standard);
    }
}

export function buildLayout(size: KeyboardSize, standard: KeyboardStandard): KeyboardLayout {
    const keys = keysFor(size, standard);
    const codes = [...new Set(keys.flatMap((key) => (key.code === null ? [] : [key.code])))];

    return {
        keys,
        width: Math.max(...keys.map((key) => key.x + key.w)),
        height: Math.max(...keys.map((key) => key.y + key.h)),
        codes,
        // Above the number pad, level with the function row, as on the boards
        // this drawing copies.
        indicatorArea: size === "full" ? { x: 18.5, y: 0, w: 4, h: 1 } : null,
    };
}
