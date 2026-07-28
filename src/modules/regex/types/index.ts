/**
 * Every value in this module is plain data — no class instances, no `RegExp`
 * objects, no functions. The whole analysis crosses a `postMessage` boundary
 * on its way back from the worker, and structured clone only carries plain
 * data.
 */

export const REGEX_MODES = ["match", "substitute", "list"] as const;

export type RegexMode = (typeof REGEX_MODES)[number];

/**
 * The characters a pattern can be wrapped in when it is written or pasted as a
 * literal. Purely presentational: the delimiter never reaches the engine, it
 * only decides which character has to be escaped inside the literal form.
 */
export const REGEX_DELIMITERS = [
    "slash",
    "tilde",
    "at",
    "semicolon",
    "percent",
    "backtick",
    "hash",
] as const;

export type RegexDelimiter = (typeof REGEX_DELIMITERS)[number];

export const DELIMITER_CHARACTERS: Record<RegexDelimiter, string> = {
    slash: "/",
    tilde: "~",
    at: "@",
    semicolon: ";",
    percent: "%",
    backtick: "`",
    hash: "#",
};

/**
 * Flags in the order they are displayed. Six map onto real ECMAScript flag
 * letters; `extended` and `ungreedy` do not exist in JavaScript at all and are
 * applied by rewriting the pattern before it reaches the engine.
 */
export const REGEX_FLAGS = [
    "global",
    "multiline",
    "ignoreCase",
    "dotAll",
    "extended",
    "unicode",
    "ungreedy",
    "sticky",
] as const;

export type RegexFlag = (typeof REGEX_FLAGS)[number];

/* ------------------------------------------------------------- pattern AST --- */

export type RegexNodeKind =
    | "sequence"
    | "alternation"
    | "literal"
    | "escapedLiteral"
    | "dot"
    | "anchorStart"
    | "anchorEnd"
    | "wordBoundary"
    | "shorthand"
    | "unicodeProperty"
    | "controlEscape"
    | "hexEscape"
    | "unicodeEscape"
    | "characterClass"
    | "classRange"
    | "backreference"
    | "namedBackreference"
    | "captureGroup"
    | "namedGroup"
    | "nonCapturingGroup"
    | "lookahead"
    | "lookbehind"
    | "atomicGroup"
    | "modifierGroup"
    | "recursion"
    | "comment"
    | "ignorableWhitespace"
    | "unknown";

export type RegexQuantifier = {
    readonly min: number;
    /** `null` means unbounded — `*`, `+`, and `{n,}`. */
    readonly max: number | null;
    readonly greedy: boolean;
    /** `a*+` and friends. ECMAScript has no possessive quantifiers. */
    readonly possessive: boolean;
    /** Where the quantifier itself sits, so it can be rewritten in place. */
    readonly start: number;
    readonly end: number;
};

/**
 * One node of the parsed pattern. `start`/`end` are indices into the original
 * pattern string and always describe the node without its quantifier, so a
 * rewrite can splice either half independently.
 */
export type RegexNode = {
    readonly kind: RegexNodeKind;
    readonly start: number;
    readonly end: number;
    readonly quantifier?: RegexQuantifier;
    readonly children?: readonly RegexNode[];
    /** Literal text a leaf stands for, already unescaped. */
    readonly value?: string;
    /** 1-based capture index, on capturing and named groups only. */
    readonly groupIndex?: number;
    readonly groupName?: string;
    /** `[^…]`, `(?!…)`, `(?<!…)`, `\P{…}`, `\D`, `\W`, `\S`, `\B`. */
    readonly negated?: boolean;
    /** The letter behind a shorthand (`d`, `w`, `s`) or property name. */
    readonly detail?: string;
    /** Opening delimiter of a container, e.g. `(?<name>` — used for spans. */
    readonly openLength?: number;
    readonly closeLength?: number;
};

export type RegexGroupInfo = {
    readonly index: number;
    readonly name: string | null;
};

/* ------------------------------------------------------------ highlighting --- */

export type HighlightKind =
    | "plain"
    | "anchor"
    | "quantifier"
    | "group"
    | "charClass"
    | "escape"
    | "alternation"
    | "backreference"
    | "comment";

/** A half-open slice of the pattern painted one colour. */
export type HighlightSpan = {
    readonly start: number;
    readonly end: number;
    readonly kind: HighlightKind;
};

/* -------------------------------------------------------------- explanation --- */

/** The escapes that stand for one non-printing character. */
export const CONTROL_ESCAPE_NAMES = [
    "newline",
    "carriageReturn",
    "tab",
    "formFeed",
    "verticalTab",
    "nul",
    "backspace",
] as const;

export type ControlEscapeName = (typeof CONTROL_ESCAPE_NAMES)[number];

/**
 * A discriminated union rather than a bag of ICU arguments, so every branch is
 * type-checked against the message it renders. A `Record<string, unknown>` of
 * arguments would compile and then quietly render `{count}` verbatim.
 */
export type ExplanationDetail =
    | { readonly kind: "anchorStartLine" }
    | { readonly kind: "anchorStartString" }
    | { readonly kind: "anchorEndLine" }
    | { readonly kind: "anchorEndString" }
    | { readonly kind: "wordBoundary" }
    | { readonly kind: "nonWordBoundary" }
    | { readonly kind: "literalText"; readonly text: string }
    | { readonly kind: "literalChar"; readonly char: string; readonly code: number }
    | { readonly kind: "dot" }
    | { readonly kind: "dotAll" }
    | { readonly kind: "shorthandDigit" }
    | { readonly kind: "shorthandNonDigit" }
    | { readonly kind: "shorthandWord" }
    | { readonly kind: "shorthandNonWord" }
    | { readonly kind: "shorthandSpace" }
    | { readonly kind: "shorthandNonSpace" }
    | { readonly kind: "unicodeProperty"; readonly property: string }
    | { readonly kind: "unicodePropertyNegated"; readonly property: string }
    | { readonly kind: "controlEscape"; readonly name: ControlEscapeName; readonly code: number }
    | { readonly kind: "controlLetter"; readonly letter: string }
    | { readonly kind: "codePointEscape"; readonly char: string; readonly code: number }
    | { readonly kind: "characterClass" }
    | { readonly kind: "characterClassNegated" }
    | { readonly kind: "classRange"; readonly from: string; readonly to: string }
    | { readonly kind: "backreference"; readonly index: number }
    | { readonly kind: "namedBackreference"; readonly name: string }
    | { readonly kind: "captureGroup"; readonly index: number }
    | { readonly kind: "namedGroup"; readonly index: number; readonly name: string }
    | { readonly kind: "nonCapturingGroup" }
    | { readonly kind: "lookahead" }
    | { readonly kind: "negativeLookahead" }
    | { readonly kind: "lookbehind" }
    | { readonly kind: "negativeLookbehind" }
    | { readonly kind: "atomicGroup" }
    | { readonly kind: "modifierGroup"; readonly modifiers: string }
    | { readonly kind: "recursion" }
    | { readonly kind: "comment" }
    | { readonly kind: "alternation"; readonly count: number }
    | { readonly kind: "alternationBranch"; readonly index: number }
    | { readonly kind: "quantifierOptional" }
    | { readonly kind: "quantifierZeroOrMore" }
    | { readonly kind: "quantifierOneOrMore" }
    | { readonly kind: "quantifierExactly"; readonly count: number }
    | { readonly kind: "quantifierAtLeast"; readonly min: number }
    | { readonly kind: "quantifierBetween"; readonly min: number; readonly max: number }
    | { readonly kind: "unknown" };

export type Greediness = "greedy" | "lazy" | "possessive";

export type ExplanationNode = {
    /** Stable across re-renders: derived from the node's span in the pattern. */
    readonly id: string;
    readonly detail: ExplanationDetail;
    /** The exact pattern slice this line describes, rendered monospaced. */
    readonly source: string;
    /** Set on quantifier lines only. */
    readonly greediness?: Greediness;
    readonly children: readonly ExplanationNode[];
};

/* -------------------------------------------------------------- diagnostics --- */

export type RegexDiagnosticCode = "nestedQuantifier" | "unsupportedConstruct";

export type RegexDiagnostic = {
    readonly code: RegexDiagnosticCode;
    readonly severity: "error" | "warning";
    readonly start: number;
    readonly end: number;
    /** The offending syntax, quoted back verbatim. */
    readonly source: string;
};

/* ------------------------------------------------------------------ matches --- */

export type RegexCapture = {
    /** 1-based, matching `$1` in a replacement. */
    readonly index: number;
    readonly name: string | null;
    /** `null` when the group took no part in this match. */
    readonly value: string | null;
    readonly start: number | null;
    readonly end: number | null;
};

export type RegexMatch = {
    readonly start: number;
    readonly end: number;
    readonly value: string;
    readonly captures: readonly RegexCapture[];
};

/* ----------------------------------------------------------------- analysis --- */

export type RegexFailureReason =
    | "pattern_too_long"
    | "input_too_long"
    | "replacement_too_long"
    | "invalid_pattern"
    | "unsupported_construct"
    | "timed_out";

export type RegexFailure = {
    readonly reason: RegexFailureReason;
    /** 1-based character position in the pattern, when one can be pinpointed. */
    readonly position?: number;
    /** The offending construct, or the engine's own message, quoted verbatim. */
    readonly detail?: string;
    readonly limit?: number;
};

export type RegexAnalysisRequest = {
    readonly pattern: string;
    readonly flags: readonly RegexFlag[];
    readonly mode: RegexMode;
    readonly replacement: string;
    readonly testString: string;
};

/**
 * Highlighting and the explanation are produced from the parse tree, which is
 * built without ever compiling the pattern — so they survive a pattern the
 * engine rejects, and the panels keep showing something useful while it is
 * being typed. That is why `failure` sits beside them rather than replacing
 * the whole result.
 */
export type RegexAnalysis = {
    readonly highlights: readonly HighlightSpan[];
    readonly explanation: readonly ExplanationNode[];
    readonly diagnostics: readonly RegexDiagnostic[];
    readonly failure: RegexFailure | null;
    readonly matches: readonly RegexMatch[];
    readonly groups: readonly RegexGroupInfo[];
    /** True when the match cap was reached and later matches were dropped. */
    readonly truncated: boolean;
    readonly durationMs: number;
    /** Substitution or list output; empty in match mode. */
    readonly output: string;
    /** What was actually handed to `new RegExp`, after `x` and `U` rewrites. */
    readonly compiledSource: string;
    readonly compiledFlags: string;
};

export type RegexExportRequest = {
    readonly mode: RegexMode;
    readonly pattern: string;
    readonly flagLetters: string;
    readonly testString: string;
    readonly analysis: RegexAnalysis;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
