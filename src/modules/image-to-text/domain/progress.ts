import type { OcrProgress } from "../types";

/** The one status `tesseract.js` reports while reading; every other one is setup. */
const RECOGNIZING_STATUS = "recognizing text";

/** Maps a `tesseract.js` logger message onto the two phases the page shows. */
export function readOcrProgress(message: { status: string; progress: number }): OcrProgress {
    const ratio = Number.isFinite(message.progress)
        ? Math.min(1, Math.max(0, message.progress))
        : 0;

    return { phase: message.status === RECOGNIZING_STATUS ? "recognizing" : "loading", ratio };
}

export class StallError extends Error {
    constructor(stallMs: number) {
        super(`engine sent nothing for ${stallMs} ms`);
        this.name = "StallError";
    }
}

/**
 * Runs `work`, failing with `StallError` when it goes `stallMs` without
 * calling `alive`. An engine that crashes, or a language file that never
 * arrives, can leave a promise that settles nothing at all — this is what
 * turns that into an answer.
 */
export async function watchStall<T>(
    stallMs: number,
    work: (alive: () => void) => Promise<T>,
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        return await new Promise<T>((resolve, reject) => {
            const alive = () => {
                clearTimeout(timer);
                timer = setTimeout(() => reject(new StallError(stallMs)), stallMs);
            };

            alive();
            work(alive).then(resolve, reject);
        });
    } finally {
        clearTimeout(timer);
    }
}
