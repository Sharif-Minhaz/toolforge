/**
 * What the converter had to guess.
 *
 * Every one of these is a place where plain text is genuinely ambiguous and the
 * tool picked a reading. They are surfaced beside the result rather than kept
 * internal, because the whole product promise here is that the LaTeX is a
 * *suggestion* to be checked against the preview — and "we guessed" is far more
 * useful to a reader than silence.
 *
 * A literal union, so `equation.notes.<name>` stays statically checkable.
 */
export const CONVERSION_NOTES = [
    "implied_power",
    /** The same guess as `implied_power`, resolved the other way — `H2O`. */
    "implied_subscript",
    "implied_fraction",
    "closed_group",
    /**
     * Not a guess the translator made — a whole equation a model read out of a
     * picture. It carries the same weight as the others and belongs in the same
     * list: everything under this heading is something to check against the
     * preview before trusting it.
     */
    "recognized",
] as const;

export type ConversionNote = (typeof CONVERSION_NOTES)[number];

/**
 * One equation, as converted.
 *
 * `source` is kept beside the LaTeX so a tab can be labelled with what the
 * reader typed, and so a second conversion can tell whether a line changed.
 *
 * The shape is deliberately what an image-recognition provider would also
 * return — see `domain/text-to-latex.ts` for the seam. `notes` is where a
 * provider's confidence would land, as a note rather than a number: a percentage
 * nobody can act on is worse than a sentence saying what was uncertain.
 */
export type ConvertedEquation = {
    readonly source: string;
    readonly latex: string;
    readonly notes: readonly ConversionNote[];
    /**
     * The other defensible ways to read the same line, best first.
     *
     * Empty when there is only one — and for anything a model transcribed,
     * where there is no second reading to offer because nobody guessed.
     */
    readonly readings: readonly EquationReading[];
};

/**
 * What makes one reading differ from the one above it.
 *
 * A literal union so `equation.readings.<kind>` stays statically checkable, and
 * so the picker cannot show a label for a reading the converter never produces.
 */
export const READING_KINDS = ["power", "subscript", "literal", "narrowFraction"] as const;

export type ReadingKind = (typeof READING_KINDS)[number];

/**
 * One candidate reading of a line.
 *
 * The tool has always known it was guessing — the notes said so. This is the
 * next thing along: rather than reporting a guess and leaving the reader to
 * rewrite it, the alternatives are handed over ready to pick. `H2O` is the case
 * that forces it, because chemistry wants `H_2O` and algebra wants `H^2`, and
 * nothing whatever in the three characters says which.
 */
export type EquationReading = {
    readonly kind: ReadingKind;
    readonly latex: string;
    readonly notes: readonly ConversionNote[];
};

/**
 * How to resolve the two ambiguities that have more than one defensible answer.
 *
 * Passed in rather than decided inside the translator, which is what lets one
 * line be converted several ways and the results offered side by side.
 */
export type ReadingOptions = {
    /** What digits straight after a single letter mean. */
    readonly digits: "power" | "subscript" | "literal";
    /** How far back a fraction's numerator reaches. */
    readonly fraction: "term" | "factor";
};

export type EquationFailureReason =
    /** Nothing but whitespace was typed. */
    | "empty_input"
    | "too_long"
    /** More lines than the tab strip can stay usable with. */
    | "too_many_equations";

export type EquationFailure = {
    readonly ok: false;
    readonly reason: EquationFailureReason;
};

export type EquationSuccess = {
    readonly ok: true;
    readonly equations: readonly ConvertedEquation[];
    /**
     * What the input's own delimiters said about display mode — `$$` and `\[`
     * mean a block, `$` and `\(` mean inline — or `null` when it carried none.
     *
     * `null` rather than a default, so the caller can tell "the paste asked for
     * inline" from "the paste did not say" and leave the switch alone.
     */
    readonly display: boolean | null;
};

export type EquationResult = EquationSuccess | EquationFailure;

/**
 * The four ways the finished LaTeX can be taken away.
 *
 * `mathml` is the only one that can fail — it is produced by KaTeX, so it needs
 * the source to parse — which is why `formatEquation` returns a typed result
 * rather than a string.
 */
export const OUTPUT_FORMATS = ["latex", "markdown", "markdownBlock", "mathml"] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export type FormatResult =
    { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string };

/* ------------------------------------------------------------ tokenizer --- */

export const GROUP_DELIMITERS = ["(", "[", "{"] as const;

export type GroupDelimiter = (typeof GROUP_DELIMITERS)[number];

/**
 * What the plain-text reader breaks an equation into.
 *
 * `spaced` is on every token and is load-bearing rather than cosmetic: it is how
 * the output keeps the shape the reader typed. `n(n+1)` stays joined and
 * `x + y` stays spread, without the renderer needing an opinion about implicit
 * multiplication. It is also what tells `x2` (a power) from `x 2` (two atoms).
 */
export type EquationToken =
    | { readonly kind: "word"; readonly text: string; readonly spaced: boolean }
    | { readonly kind: "number"; readonly text: string; readonly spaced: boolean }
    | { readonly kind: "operator"; readonly text: string; readonly spaced: boolean }
    /** A backslash command the reader typed themselves, passed through verbatim. */
    | { readonly kind: "command"; readonly text: string; readonly spaced: boolean }
    | {
          readonly kind: "group";
          readonly delimiter: GroupDelimiter;
          readonly items: readonly EquationToken[];
          readonly spaced: boolean;
          /** False when the input ran out before the bracket was closed. */
          readonly closed: boolean;
      };

/* ---------------------------------------------------- image recognition --- */

/**
 * The two ways an equation gets into the tool. A literal union so
 * `equation.sources.<id>` stays statically checkable — and so the island's mode
 * switch and the article's table cannot name different things.
 */
export const EQUATION_SOURCES = ["text", "image"] as const;

export type EquationSource = (typeof EQUATION_SOURCES)[number];

/**
 * Every way reading a picture can fail, from the reader's point of view.
 *
 * Longer than the text converter's list because it crosses three boundaries the
 * text path never touches: the browser's own file check, the challenge, and the
 * worker. Each keeps the name the layer that raised it used — `too_small` and
 * `no_equation` are the recognizer's own vocabulary, not invented here.
 */
export const RECOGNITION_FAILURE_REASONS = [
    "missing_image",
    "empty_file",
    "unsupported_type",
    "too_large",
    "too_small",
    "invalid_request",
    "challenge_required",
    "challenge_failed",
    "rate_limited",
    "unauthorized",
    "not_configured",
    "upstream_unavailable",
    "unreadable_response",
    /** The model looked and found no maths. A real answer, not a breakage. */
    "no_equation",
] as const;

export type RecognitionFailureReason = (typeof RECOGNITION_FAILURE_REASONS)[number];

export type RecognitionFailure = {
    readonly ok: false;
    readonly reason: RecognitionFailureReason;
};

/**
 * One equation as the recognizer read it.
 *
 * `displayMode` is the model's own judgement about whether the equation stood on
 * its own line or ran inside a sentence — worth keeping, because it is the one
 * thing about the picture that the LaTeX itself cannot carry.
 */
export type RecognizedEquation = {
    readonly latex: string;
    readonly displayMode: boolean;
};

/**
 * The chosen file and the object URL its preview is drawn from.
 *
 * Held by the workbench rather than by the image panel, because a picture can
 * arrive while that panel is not on screen: pasting one from the Text tab is
 * what switches to the Image tab in the first place. One owner means one object
 * URL and one place that revokes it.
 */
export type PickedImage = {
    readonly file: File;
    readonly url: string;
};

export type RecognitionResult =
    { readonly ok: true; readonly equations: readonly RecognizedEquation[] } | RecognitionFailure;

export type EquationExportRequest = {
    readonly equations: readonly ConvertedEquation[];
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
