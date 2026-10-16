/**
 * Chords that a keyboard's matrix may refuse. A cheap board wires its keys in
 * a grid and cannot always tell which of four keys at the corners of a
 * rectangle is down, so it blocks one — usually in exactly the chords games
 * use. Each chord here is one people actually press.
 *
 * The test cannot see a key that never arrives; what it can do is show, live,
 * which keys of the chord are down. A key that stays dark while the rest light
 * is the one the matrix blocked.
 */

export type GhostCombo = {
    readonly id: GhostComboId;
    readonly codes: readonly string[];
};

export const GHOST_COMBO_IDS = ["wasd", "runJump", "sixKeys", "homeRow", "arrowsSpace"] as const;

export type GhostComboId = (typeof GHOST_COMBO_IDS)[number];

export const GHOST_COMBOS: readonly GhostCombo[] = [
    { id: "wasd", codes: ["KeyW", "KeyA", "KeyS", "KeyD"] },
    { id: "runJump", codes: ["ShiftLeft", "KeyW", "KeyA", "Space"] },
    { id: "sixKeys", codes: ["KeyQ", "KeyW", "KeyE", "KeyA", "KeyS", "KeyD"] },
    {
        id: "homeRow",
        codes: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"],
    },
    { id: "arrowsSpace", codes: ["ArrowUp", "ArrowLeft", "ArrowRight", "Space"] },
];

/** The chords a drawn board can play: a 60% board has no arrows to hold. */
export function combosFor(codes: readonly string[]): readonly GhostCombo[] {
    const available = new Set(codes);

    return GHOST_COMBOS.filter((combo) => combo.codes.every((code) => available.has(code)));
}

/** Combos newly completed by the keys currently down. */
export function completedCombos(
    held: ReadonlySet<string>,
    already: readonly string[],
): GhostComboId[] {
    return GHOST_COMBOS.filter(
        (combo) => !already.includes(combo.id) && combo.codes.every((code) => held.has(code)),
    ).map((combo) => combo.id);
}
