/**
 * Best results a reader has reached on a timed drill, kept in this browser and
 * nowhere else — the typing test's words per minute, the aim trainer's hits.
 *
 * One storage entry holding a flat map, keyed by drill and settings
 * (`typing:english:60`), because a best only means something against the same
 * settings: 90 words a minute over fifteen seconds is not 90 over two minutes.
 * Follows `docs/patterns/browser-persistence.md`: storage is a parameter with a
 * browser default, every read degrades to "no best yet", and a failed write is
 * silent — a full quota must not take the result screen down with it.
 */

export const PERSONAL_BEST_STORAGE_KEY = "toolforge.personal-bests";

/** Entries kept. Two drills × a handful of settings each sits far below it. */
const MAX_ENTRIES = 64;

export type PersonalBestStorage = Pick<Storage, "getItem" | "setItem">;

export type PersonalBests = Readonly<Record<string, number>>;

const EMPTY: PersonalBests = {};

function browserStorage(): PersonalBestStorage | undefined {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        // Reading `localStorage` throws outright when storage is blocked by policy.
        return undefined;
    }
}

export function readPersonalBests(
    storage: PersonalBestStorage | undefined = browserStorage(),
): PersonalBests {
    if (!storage) {
        return EMPTY;
    }

    try {
        const parsed: unknown = JSON.parse(storage.getItem(PERSONAL_BEST_STORAGE_KEY) ?? "{}");

        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return EMPTY;
        }

        // A hand-edited entry that is not a finite, positive number is dropped,
        // not shown as a best nobody reached.
        return Object.fromEntries(
            Object.entries(parsed)
                .filter(
                    (entry): entry is [string, number] =>
                        typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0,
                )
                .slice(0, MAX_ENTRIES),
        );
    } catch {
        return EMPTY;
    }
}

/**
 * Records `value` under `key` when it beats what is there, and returns the
 * map as it now stands. A tie is not a new best.
 */
export function recordPersonalBest(
    key: string,
    value: number,
    storage: PersonalBestStorage | undefined = browserStorage(),
): PersonalBests {
    const current = readPersonalBests(storage);

    if (!Number.isFinite(value) || value <= 0 || value <= (current[key] ?? 0)) {
        return current;
    }

    const next = { ...current, [key]: value };

    try {
        storage?.setItem(PERSONAL_BEST_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Quota or policy: the best still shows for this visit.
    }

    return next;
}
