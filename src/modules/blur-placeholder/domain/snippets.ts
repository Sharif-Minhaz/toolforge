import type { BlurPlaceholder } from "../types";

/**
 * The three shapes a placeholder actually gets used in. All three are code
 * rather than copy, so they are built here and never translated — a Bangla
 * `placeholder="blur"` would not compile.
 *
 * `SNIPPET_KINDS` is a literal union so the message keys naming each one stay
 * checkable at compile time.
 */
export const SNIPPET_KINDS = ["next", "react", "css"] as const;

export type SnippetKind = (typeof SNIPPET_KINDS)[number];

export type SnippetInput = {
    readonly placeholder: BlurPlaceholder;
    readonly punch: number;
    /** The real picture's size, when one was picked. Falls back to the placeholder's shape. */
    readonly sourceWidth: number;
    readonly sourceHeight: number;
    readonly filename: string;
};

/**
 * `next/image` reads `blurDataURL` and nothing else — it never sees the hash.
 * That is the whole reason this tool writes a PNG as well as a string: the
 * hash is what you store, the data URI is what the framework wants.
 */
function buildNextSnippet(input: SnippetInput): string {
    return `<Image
    src="${input.filename}"
    alt=""
    width={${input.sourceWidth}}
    height={${input.sourceHeight}}
    placeholder="blur"
    blurDataURL="${input.placeholder.dataUri}"
/>`;
}

/** react-blurhash decodes in the browser, so it wants the hash, not the PNG. */
function buildReactSnippet(input: SnippetInput): string {
    return `<Blurhash
    hash="${input.placeholder.hash}"
    width={${input.sourceWidth}}
    height={${input.sourceHeight}}
    resolutionX={${input.placeholder.width}}
    resolutionY={${input.placeholder.height}}
    punch={${input.punch}}
/>`;
}

/**
 * No framework at all: the data URI as a background, scaled up by the browser.
 * `background-size: cover` rather than `100% 100%`, so a container that is not
 * the picture's shape crops instead of stretching.
 */
function buildCssSnippet(input: SnippetInput): string {
    return `.image-placeholder {
    background-image: url("${input.placeholder.dataUri}");
    background-size: cover;
    background-position: center;
}`;
}

const BUILDERS: Record<SnippetKind, (input: SnippetInput) => string> = {
    next: buildNextSnippet,
    react: buildReactSnippet,
    css: buildCssSnippet,
};

export function buildSnippet(kind: SnippetKind, input: SnippetInput): string {
    return BUILDERS[kind](input);
}
