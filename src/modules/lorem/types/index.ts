/**
 * Canonical corpus ids. A literal union so `lorem.sources.<id>.tagline` stays
 * statically checkable; the human-readable label of each corpus is data and
 * lives in `domain/corpora.ts`, not in the message catalogue.
 */
export const LOREM_SOURCES = [
    "lorem",
    "cicero",
    "cicero-en",
    "europan",
    "europan-en",
    "far-far-away",
    "werther",
    "kafka",
    "bangla",
    "pangram",
    "alphabet",
    "emoji",
] as const;

export type LoremSource = (typeof LOREM_SOURCES)[number];

/** What the requested amount counts. */
export const LOREM_UNITS = ["words", "characters", "sentences", "paragraphs"] as const;

export type LoremUnit = (typeof LOREM_UNITS)[number];

export const LOREM_FORMATS = ["plain", "html"] as const;

export type LoremFormat = (typeof LOREM_FORMATS)[number];

export type LoremOptions = {
    readonly source: LoremSource;
    readonly unit: LoremUnit;
    /** How many of `unit` to emit in total. */
    readonly amount: number;
    /** How many paragraphs the amount is spread across. Ignored for `paragraphs`. */
    readonly paragraphs: number;
    /** Lead the first sentence with the corpus's canonical opening words. */
    readonly startWithOpener: boolean;
    readonly format: LoremFormat;
};

export type LoremStats = {
    readonly words: number;
    /** Counted in code points, so an emoji is one character rather than two. */
    readonly characters: number;
    readonly sentences: number;
    readonly paragraphs: number;
};

export type LoremFailureReason = "invalid_amount" | "invalid_paragraphs";

export type LoremGenerationFailure = {
    readonly ok: false;
    readonly reason: LoremFailureReason;
};

export type LoremGenerationSuccess = {
    readonly ok: true;
    /**
     * The generated paragraphs as plain text, before any format is applied.
     * Kept separate so switching between plain and HTML re-renders the same
     * passage instead of minting a new one.
     */
    readonly paragraphs: readonly string[];
    /** One rendered block per paragraph, already in the requested format. */
    readonly blocks: readonly string[];
    /** Every block joined the way the format expects. */
    readonly text: string;
    readonly stats: LoremStats;
    /** BCP-47 tag of the corpus, so the UI can set `lang` on the output. */
    readonly lang: string;
};

export type LoremGenerationResult = LoremGenerationSuccess | LoremGenerationFailure;

export type LoremExportRequest = {
    readonly text: string;
    readonly format: LoremFormat;
    readonly source: LoremSource;
    /** Injected so exports are deterministic in tests. */
    readonly generatedAt: Date;
};

/** Injected wherever randomness is used, so generation is testable. */
export type RandomSource = () => number;

export type { DownloadFile } from "@/modules/tools/types";
