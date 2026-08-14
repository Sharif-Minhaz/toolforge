import {
    IDENTIFIER_CASES,
    type IdentifierCase,
    type TextCase,
    type TextCaseOptions,
} from "../types";

/**
 * Ceiling on one run. Every case is a handful of linear passes on the main
 * thread, and fifty thousand characters is a long chapter — far past anything
 * anybody pastes into a case converter, and still well inside a frame.
 */
export const MAX_TEXT_CASE_INPUT_LENGTH = 50_000;

/** Longest `?text=` value accepted from a shared link. */
export const MAX_SHARED_TEXT_LENGTH = 2048;

/**
 * The sample every chip in the picker renders in its own case.
 *
 * Data, not copy: it reads the same in either locale, because the point is the
 * shape of the letters rather than the words. Chosen so all fourteen samples
 * come out different — it has a capital to invert, a small word (`Of`) that
 * separates Title Case from Capitalized Case, and three words, which is the
 * fewest that shows a delimiter twice.
 */
export const CASE_SAMPLE = "Two Of Us";

/**
 * Whether a case builds a new identifier out of the words rather than
 * rewriting the letters where they stand. The two families answer to different
 * rules everywhere — refusals, naming, the acronym switch — so the question is
 * asked once, here.
 */
export function isIdentifierCase(textCase: TextCase): textCase is IdentifierCase {
    return (IDENTIFIER_CASES as readonly TextCase[]).includes(textCase);
}

/**
 * The seven identifier cases spell their own names.
 *
 * Data rather than copy, and kept out of the message catalogue for the same
 * reason `LF (Unix)` and `RFC 3986` are: `snake_case` is a token every
 * developer already reads in English, and a translated one would name nothing.
 * The seven prose cases are ordinary words and *are* translated, under
 * `textCase.cases`.
 */
export const IDENTIFIER_CASE_NAMES: Record<IdentifierCase, string> = {
    camel: "camelCase",
    pascal: "PascalCase",
    snake: "snake_case",
    kebab: "kebab-case",
    constant: "CONSTANT_CASE",
    dot: "dot.case",
    path: "path/case",
};

/**
 * The five cases that decide capitalisation one word at a time, and can
 * therefore be told to leave an acronym alone. The other nine either rewrite
 * every letter the same way (`lower`, `upper`, `alternating`, `inverse`) or
 * fix the case of the whole identifier by definition (`snake`, `kebab`,
 * `constant`, `dot`, `path`).
 */
const ACRONYM_AWARE_CASES: readonly TextCase[] = [
    "sentence",
    "capitalized",
    "title",
    "camel",
    "pascal",
];

/**
 * One predicate rather than a pair of rules, so the domain and the switch in
 * the options panel cannot drift apart.
 */
export function supportsAcronyms(textCase: TextCase): boolean {
    return ACRONYM_AWARE_CASES.includes(textCase);
}

export const DEFAULT_TEXT_CASE_OPTIONS: TextCaseOptions = {
    textCase: "sentence",
    // On by default: a pasted list is the common case, and for a passage that
    // holds one line it makes no difference at all.
    perLine: true,
    // Off by default, and deliberately. The single most common reason anybody
    // opens this tool is a paragraph typed with the caps lock on — and in that
    // paragraph every word is a run of capitals, so preserving acronyms would
    // hand back exactly what was pasted in.
    preserveAcronyms: false,
};
