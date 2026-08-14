/**
 * The vocabulary the plain-text reader knows.
 *
 * Data, not logic. Every table here is a word somebody types when they cannot
 * type the symbol — and the reason they are tables rather than branches in the
 * translator is that the article prints them: a reader has to be able to see
 * what the tool understands, or they are guessing at a guesser.
 */

/**
 * Greek names, lower and upper.
 *
 * The capitals are only the eleven TeX actually defines a command for. `\Alpha`
 * does not exist — the capital alpha *is* a Latin `A` — so writing `Alpha` gives
 * back `A`, which is both correct typography and what every TeX author does by
 * hand.
 */
export const LOWER_GREEK = [
    "alpha",
    "beta",
    "gamma",
    "delta",
    "epsilon",
    "varepsilon",
    "zeta",
    "eta",
    "theta",
    "vartheta",
    "iota",
    "kappa",
    "lambda",
    "mu",
    "nu",
    "xi",
    "pi",
    "rho",
    "sigma",
    "tau",
    "upsilon",
    "phi",
    "varphi",
    "chi",
    "psi",
    "omega",
] as const;

export const UPPER_GREEK = [
    "Gamma",
    "Delta",
    "Theta",
    "Lambda",
    "Xi",
    "Pi",
    "Sigma",
    "Upsilon",
    "Phi",
    "Psi",
    "Omega",
] as const;

/** Capitals with no command of their own; TeX writes them as Latin letters. */
const LATIN_LOOKALIKE_GREEK: Record<string, string> = {
    Alpha: "A",
    Beta: "B",
    Epsilon: "E",
    Zeta: "Z",
    Eta: "H",
    Iota: "I",
    Kappa: "K",
    Mu: "M",
    Nu: "N",
    Omicron: "O",
    Rho: "P",
    Tau: "T",
    Chi: "X",
};

/**
 * Words that stand for a symbol. Written out rather than generated, because the
 * spellings people actually type — `infty`, `inf`, `deg` — are not derivable
 * from the names.
 */
export const WORD_SYMBOLS: Record<string, string> = {
    ...Object.fromEntries(LOWER_GREEK.map((name) => [name, `\\${name}`])),
    ...Object.fromEntries(UPPER_GREEK.map((name) => [name, `\\${name}`])),
    ...LATIN_LOOKALIKE_GREEK,
    infinity: "\\infty",
    infty: "\\infty",
    inf: "\\infty",
    times: "\\times",
    cdot: "\\cdot",
    dot: "\\cdot",
    degrees: "^\\circ",
    degree: "^\\circ",
    deg: "^\\circ",
    partial: "\\partial",
    nabla: "\\nabla",
    grad: "\\nabla",
    hbar: "\\hbar",
    ell: "\\ell",
    approx: "\\approx",
    propto: "\\propto",
    equiv: "\\equiv",
    forall: "\\forall",
    exists: "\\exists",
    in: "\\in",
    notin: "\\notin",
    subset: "\\subset",
    subseteq: "\\subseteq",
    cup: "\\cup",
    cap: "\\cap",
    emptyset: "\\emptyset",
    reals: "\\mathbb{R}",
    naturals: "\\mathbb{N}",
    integers: "\\mathbb{Z}",
    rationals: "\\mathbb{Q}",
    complexes: "\\mathbb{C}",
};

/**
 * Names TeX sets upright rather than italic. `sin x` in italics reads as
 * *s* times *i* times *n* times *x*, which is why the commands exist at all.
 */
export const NAMED_FUNCTIONS = [
    "sin",
    "cos",
    "tan",
    "cot",
    "sec",
    "csc",
    "arcsin",
    "arccos",
    "arctan",
    "sinh",
    "cosh",
    "tanh",
    "coth",
    "log",
    "ln",
    "lg",
    "exp",
    "det",
    "dim",
    "ker",
    "deg",
    "gcd",
    "arg",
    "Pr",
    "hom",
] as const;

/**
 * Operators that take limits and then a body. The `lim` family is here too —
 * it takes only a subscript, which the translator handles by never emitting an
 * empty `^{}`.
 */
export const BIG_OPERATORS: Record<string, string> = {
    sum: "\\sum",
    summation: "\\sum",
    product: "\\prod",
    prod: "\\prod",
    integral: "\\int",
    int: "\\int",
    "double-integral": "\\iint",
    iint: "\\iint",
    oint: "\\oint",
    limit: "\\lim",
    lim: "\\lim",
    union: "\\bigcup",
    intersection: "\\bigcap",
};

/** Multi-character operators, longest first — the tokenizer matches in order. */
export const OPERATOR_SEQUENCES: readonly (readonly [string, string])[] = [
    ["<=>", "\\Leftrightarrow"],
    ["...", "\\dots"],
    ["<=", "\\leq"],
    [">=", "\\geq"],
    ["!=", "\\neq"],
    ["~=", "\\approx"],
    ["==", "="],
    ["+-", "\\pm"],
    ["-+", "\\mp"],
    ["->", "\\to"],
    ["=>", "\\Rightarrow"],
    ["**", "^"],
];

/**
 * Single characters that are already the symbol, mostly from a PDF paste. The
 * ASCII half is here too, so one table answers "what does this operator mean".
 */
export const OPERATOR_SYMBOLS: Record<string, string> = {
    "*": "\\cdot",
    "±": "\\pm",
    "∓": "\\mp",
    "×": "\\times",
    "÷": "\\div",
    "≤": "\\leq",
    "≥": "\\geq",
    "≠": "\\neq",
    "≈": "\\approx",
    "≡": "\\equiv",
    "→": "\\to",
    "⇒": "\\Rightarrow",
    "∞": "\\infty",
    "∂": "\\partial",
    "∇": "\\nabla",
    "∈": "\\in",
    "∉": "\\notin",
    "⊂": "\\subset",
    "∪": "\\cup",
    "∩": "\\cap",
    "∅": "\\emptyset",
    "∑": "\\sum",
    "∏": "\\prod",
    "∫": "\\int",
    "√": "\\sqrt",
    "·": "\\cdot",
    "−": "-",
};

/**
 * Superscript and subscript digits, which a PDF or a web page paste carries
 * intact. `x²` is not messy text at all — it is the answer already, in a
 * character LaTeX has no way to typeset.
 */
export const SUPERSCRIPT_DIGITS: Record<string, string> = {
    "⁰": "0",
    "¹": "1",
    "²": "2",
    "³": "3",
    "⁴": "4",
    "⁵": "5",
    "⁶": "6",
    "⁷": "7",
    "⁸": "8",
    "⁹": "9",
    "⁺": "+",
    "⁻": "-",
    ⁿ: "n",
};

export const SUBSCRIPT_DIGITS: Record<string, string> = {
    "₀": "0",
    "₁": "1",
    "₂": "2",
    "₃": "3",
    "₄": "4",
    "₅": "5",
    "₆": "6",
    "₇": "7",
    "₈": "8",
    "₉": "9",
    "₊": "+",
    "₋": "-",
};

/** Words the limit grammar consumes rather than renders. */
export const LIMIT_KEYWORDS = {
    from: "from",
    to: "to",
    of: "of",
    as: "as",
} as const;

/** `\sqrt`, `\sqrt[3]` and the absolute-value bars, keyed by what people type. */
export const ROOT_FUNCTIONS: Record<string, "sqrt" | "cbrt" | "abs"> = {
    sqrt: "sqrt",
    root: "sqrt",
    cbrt: "cbrt",
    cuberoot: "cbrt",
    abs: "abs",
};
