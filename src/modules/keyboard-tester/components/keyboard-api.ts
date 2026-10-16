/**
 * The Keyboard API, which TypeScript's DOM library does not describe yet. Only
 * Chromium implements it; everything here is optional so the callers have to
 * handle the browsers that do not.
 */
type KeyboardApi = {
    readonly getLayoutMap?: () => Promise<ReadonlyMap<string, string>>;
    readonly lock?: (codes?: readonly string[]) => Promise<void>;
    readonly unlock?: () => void;
};

export function keyboardApi(): KeyboardApi | undefined {
    return (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard;
}
