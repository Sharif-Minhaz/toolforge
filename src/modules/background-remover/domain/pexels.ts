import type { StockPhoto } from "../types";
import { PEXELS_HOME_URL } from "./constants";

/**
 * Turning what Pexels sends into what the picker renders.
 *
 * Pure and framework-free, so the mapping is testable against a captured payload
 * rather than against a live API — which matters more here than usual, because
 * the two things this file exists to get right are both invisible until somebody
 * complains: the *credit* the licence requires, and *which* of the eight sizes in
 * every response the grid and the composite each use.
 */

/**
 * One entry as the API sends it, narrowed to the fields used.
 *
 * Declared rather than inferred from the Zod schema so this file has no reason to
 * import one — `domain/` stays free of everything, validation included. The schema
 * in `validation/pexels.ts` is what proves a response matches this shape.
 */
export type PexelsPhotoPayload = {
    readonly id: number;
    readonly alt: string | null;
    readonly url: string;
    readonly photographer: string;
    readonly photographer_url: string;
    readonly src: {
        readonly medium: string;
        readonly large: string;
        readonly large2x: string;
        readonly original: string;
    };
};

/**
 * Which size goes behind the cut-out.
 *
 * `large2x` — roughly 1880 px on the long edge — rather than `original`.
 * `original` is whatever the photographer uploaded, which is regularly 6000 px and
 * 8 MB, and it is about to be scaled down to fit a portrait that is smaller than
 * that in almost every case. The one place it would matter is a background behind
 * a picture wider than 1880 px, where the difference is a background that is
 * slightly soft — against a download the reader waits several seconds for, on a
 * connection they are also using to fetch a 84 MB model.
 */
export function backgroundSourceUrl(photo: PexelsPhotoPayload): string {
    return photo.src.large2x;
}

/**
 * Pexels' `alt` is frequently empty. Falling back to the photographer's name
 * gives a screen reader something true to say — "a photograph by Ivan Ivanov" is
 * a worse description than "a wheat field at sunset" and a far better one than
 * "image".
 */
export function describePhoto(photo: PexelsPhotoPayload): string {
    const alt = (photo.alt ?? "").trim();

    return alt.length > 0 ? alt : photo.photographer;
}

export function toStockPhoto(photo: PexelsPhotoPayload): StockPhoto {
    return {
        id: String(photo.id),
        thumbnailUrl: photo.src.medium,
        fullUrl: backgroundSourceUrl(photo),
        description: describePhoto(photo),
        credit: {
            photographer: photo.photographer,
            photographerUrl: photo.photographer_url,
            // The page on Pexels, not the image file: the licence asks for a link
            // back to where the photograph lives, and a direct link to a JPEG is
            // not that.
            sourceUrl: photo.url,
        },
    };
}

export function toStockPhotos(photos: readonly PexelsPhotoPayload[]): StockPhoto[] {
    return photos.map(toStockPhoto);
}

/**
 * Words that mean a photograph has a person in it.
 *
 * Matched with word boundaries, which is load-bearing rather than tidy:
 * a substring test for `man` also hits **man**or, hu**man** and Ro**man**ia, and
 * a substring test for `kid` hits s**kid**. Every entry here is checked as a
 * whole word by `hidesPeople`.
 *
 * Deliberately not exhaustive — it is a filter, not a classifier.
 */
const PEOPLE_WORDS = [
    "person",
    "people",
    "man",
    "men",
    "woman",
    "women",
    "girl",
    "girls",
    "boy",
    "boys",
    "child",
    "children",
    "kid",
    "kids",
    "baby",
    "toddler",
    "family",
    "couple",
    "portrait",
    "model",
    "human",
    "lady",
    "ladies",
    "guy",
    "teenager",
    "crowd",
    "selfie",
    "businessman",
    "businesswoman",
    "hands",
    "face",
] as const;

const PEOPLE_PATTERN = new RegExp(`\\b(${PEOPLE_WORDS.join("|")})\\b`, "i");

/**
 * Whether a photograph is worth offering as a backdrop.
 *
 * The second of the two blunt instruments described in `backdrop-topics.ts`,
 * and the weaker one: it reads Pexels' `alt` text, which is written by people
 * and is frequently absent. Two consequences worth being exact about, because
 * both look like bugs otherwise:
 *
 * - **An empty `alt` is kept, not dropped.** Nothing is known about that
 *   photograph, and throwing away every picture nobody described would empty
 *   most pages. A false negative here costs one unwanted tile; a false positive
 *   costs a good background nobody ever sees.
 * - **`describePhoto`'s fallback is not used.** That falls back to the
 *   *photographer's name* when the alt is blank, and a photographer called
 *   "Man Ray" is not a picture of a man.
 *
 * The topic terms do the heavy lifting; this catches the obvious strays the
 * search still returns.
 */
export function hidesPeople(photo: PexelsPhotoPayload): boolean {
    const alt = (photo.alt ?? "").trim();

    if (alt.length === 0) {
        return true;
    }

    return !PEOPLE_PATTERN.test(alt);
}

/**
 * Whether the response says there is another page.
 *
 * Read from `next_page` rather than computed from `total_results`: the count is
 * an estimate that Pexels caps, so a page arithmetic answer says "more" for a
 * query that has already run out and the picker's "load more" button then does
 * nothing when pressed.
 */
export function hasNextPage(nextPage: string | null | undefined): boolean {
    return typeof nextPage === "string" && nextPage.length > 0;
}

/**
 * The attribution line's link back to Pexels itself, as opposed to a photograph's
 * own page. Shown once under the grid rather than on every tile.
 */
export const PEXELS_ATTRIBUTION_URL = PEXELS_HOME_URL;
