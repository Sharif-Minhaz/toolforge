/**
 * The sidebar's recently visited tools, kept in this browser and nowhere else.
 *
 * Follows `docs/patterns/browser-persistence.md`: storage is a parameter with a
 * browser default, and every read degrades to whatever can still be used. Ids
 * rather than hrefs, so a tool that moves keeps its place; the sidebar resolves
 * them against the catalog, which drops any id that no longer exists.
 */

export const RECENT_TOOLS_STORAGE_KEY = "toolforge.recent-tools";

/** How many rows the sidebar's Recent section shows. */
export const MAX_RECENT_TOOLS = 5;

// One spare: the sidebar leaves out the page you are on, and the spare keeps
// the section full while you are on one of its tools.
const STORED_RECENT_TOOLS = MAX_RECENT_TOOLS + 1;

export type RecentToolsStorage = Pick<Storage, "getItem" | "setItem">;

const EMPTY: readonly string[] = [];

function browserStorage(): RecentToolsStorage | undefined {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        // Reading `localStorage` throws outright when storage is blocked by policy.
        return undefined;
    }
}

/** Most recent first, deduplicated — a hand-edited duplicate would collide as a React key. */
export function readRecentTools(
    storage: RecentToolsStorage | undefined = browserStorage(),
): readonly string[] {
    if (!storage) {
        return EMPTY;
    }

    try {
        const parsed: unknown = JSON.parse(storage.getItem(RECENT_TOOLS_STORAGE_KEY) ?? "[]");

        if (!Array.isArray(parsed)) {
            return EMPTY;
        }

        const ids = parsed.filter((id): id is string => typeof id === "string");

        return [...new Set(ids)].slice(0, STORED_RECENT_TOOLS);
    } catch {
        return EMPTY;
    }
}

/** Moves `id` to the front. Silent on a failed write: a full quota must not break navigation. */
export function rememberRecentTool(
    id: string,
    storage: RecentToolsStorage | undefined = browserStorage(),
): readonly string[] {
    const next = [id, ...readRecentTools(storage).filter((existing) => existing !== id)].slice(
        0,
        STORED_RECENT_TOOLS,
    );

    return writeRecentTools(next, storage);
}

/** Drops `id` until the next visit puts it back. */
export function forgetRecentTool(
    id: string,
    storage: RecentToolsStorage | undefined = browserStorage(),
): readonly string[] {
    return writeRecentTools(
        readRecentTools(storage).filter((existing) => existing !== id),
        storage,
    );
}

function writeRecentTools(
    ids: readonly string[],
    storage: RecentToolsStorage | undefined,
): readonly string[] {
    try {
        storage?.setItem(RECENT_TOOLS_STORAGE_KEY, JSON.stringify(ids));
    } catch {
        // Quota exceeded, or a private window that refuses writes.
    }

    return ids;
}
