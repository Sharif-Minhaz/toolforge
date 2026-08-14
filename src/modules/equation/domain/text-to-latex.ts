import type {
    ConversionNote,
    ConvertedEquation,
    EquationReading,
    EquationResult,
    EquationToken,
    ReadingKind,
    ReadingOptions,
} from "../types";
import { MAX_EQUATION_INPUT_LENGTH, MAX_EQUATIONS } from "./constants";
import {
    BIG_OPERATORS,
    LIMIT_KEYWORDS,
    NAMED_FUNCTIONS,
    OPERATOR_SEQUENCES,
    OPERATOR_SYMBOLS,
    ROOT_FUNCTIONS,
    WORD_SYMBOLS,
} from "./symbols";
import { stripMathDelimiters } from "./delimiters";
import { hasUnclosedGroup, tokenize } from "./tokenize";

/**
 * Messy plain text to LaTeX.
 *
 * **What this is, and is not.** It is a notation translator: it knows the shapes
 * people type when they cannot type maths — `x2`, `sqrt(pi)`, `sum i=1 to n of`
 * — and rewrites them. It is not a natural-language parser and does not pretend
 * to be one; "the integral of e to the minus x squared" is prose, and this
 * returns prose.
 *
 * **Why it is written rather than installed.** No published library does the
 * stated job. `mathjs` reads `x2` as a variable *named* `x2` and cannot parse
 * `sum i=1 to n of` at all, and the ASCIIMath family wants its own strict
 * grammar rather than what somebody typed in a hurry. So the rules are here,
 * each one small enough to test on its own — see `tests/text-to-latex.test.ts`,
 * which pins every example the article prints and then hands each result to
 * KaTeX, so a rule that produces confident nonsense fails against a parser this
 * file's author did not write.
 *
 * **The seam.** Everything downstream — the editor, the preview, the copy
 * formats, the MCP adapter — consumes `ConvertedEquation[]` and nothing else. A
 * recognition provider reading an image would produce the same array from a
 * different source, and no other layer would change.
 *
 * **Every guess is reported, and then offered.** Three rules here are genuinely
 * ambiguous. Each pushes a `ConversionNote` rather than resolving quietly — and
 * for the two that have more than one defensible answer, `readEquation` converts
 * the line every way and hands the reader the alternatives to choose from. `H2O`
 * is the case that forces it: chemistry wants `H_2O`, algebra wants `H^2`, and
 * nothing in the three characters says which. Reporting a guess is honest;
 * offering the other readings is useful.
 */

/** Operators that end a term, and therefore bound a fraction on either side. */
const TERM_BOUNDARIES = new Set([
    "+",
    "-",
    "=",
    "<",
    ">",
    ",",
    ";",
    "<=",
    ">=",
    "!=",
    "~=",
    "==",
    "+-",
    "-+",
    "->",
    "=>",
    "<=>",
]);

/** A differential, but only where an integral makes that reading the right one. */
const DIFFERENTIAL = /^d[a-z]$/;

/** A control sequence written out of letters, which the next letter would extend. */
const TRAILING_COMMAND = /\\[A-Za-z]+$/;

const LEADING_LETTER = /^[A-Za-z]/;

const NAMED_FUNCTION_SET: ReadonlySet<string> = new Set(NAMED_FUNCTIONS);

const OPERATOR_SEQUENCE_MAP: Record<string, string> = Object.fromEntries(OPERATOR_SEQUENCES);

/**
 * One rendered piece, plus what separates it from the piece before.
 *
 * `lead` carries the reader's own spacing forward rather than the renderer
 * inventing its own. That is what keeps `n(n+1)` joined and `x + y` spread
 * without this layer needing an opinion about implicit multiplication.
 */
type Atom = {
    readonly latex: string;
    readonly lead: string;
    /** True for the operators a fraction's numerator and denominator stop at. */
    readonly boundary: boolean;
    /**
     * True for a control sequence and for each brace group that follows one.
     *
     * It is how `\frac{a}{b}` keeps its braces while `{a}` on its own gets
     * escaped to `\{a\}`. Without it the reader's own set notation and the
     * reader's own pasted LaTeX are the same three characters.
     */
    readonly command: boolean;
    /**
     * Set by an operator that became a control sequence, which needs air on
     * both sides. It is a flag rather than a space baked into `latex`, because
     * the atom after it carries its own `lead` and the two would double up.
     */
    readonly spaceAfter?: boolean;
};

type Notes = Set<ConversionNote>;

/** An argument, and whether the reader wrote the braces themselves. */
type Argument = {
    readonly latex: string;
    readonly braced: boolean;
};

/** Braces are only needed past one character; `x^2` is nicer than `x^{2}`. */
function script(argument: Argument): string {
    return argument.latex.length === 1 && !argument.braced ? argument.latex : `{${argument.latex}}`;
}

function lead(token: EquationToken): string {
    return token.spaced ? " " : "";
}

function isWord(token: EquationToken | undefined, text: string): boolean {
    return token?.kind === "word" && token.text.toLowerCase() === text;
}

function atom(latex: string, source: EquationToken): Atom {
    return { latex, lead: lead(source), boundary: false, command: false };
}

/* ------------------------------------------------------------ rendering --- */

type Walker = {
    readonly items: readonly EquationToken[];
    index: number;
    readonly notes: Notes;
    /** Set for the whole line when an integral is present; see `DIFFERENTIAL`. */
    readonly integral: boolean;
    readonly options: ReadingOptions;
};

function renderItems(items: readonly EquationToken[], walker: Walker): string {
    return joinAtoms(collectAtoms(items, walker.notes, walker.integral, walker.options));
}

/** A group as it stands, brackets and all. */
function renderGroup(token: Extract<EquationToken, { kind: "group" }>, walker: Walker): string {
    const body = renderItems(token.items, walker);

    if (token.delimiter === "{") {
        // Bare braces are TeX's own grouping and would vanish from the output.
        // A reader who typed them meant the set, so they are escaped.
        return `\\{${body}\\}`;
    }

    return token.delimiter === "[" ? `[${body}]` : `(${body})`;
}

/**
 * The next atom, for a construct that takes one: an exponent, a root's
 * radicand, a function's argument. A bracketed group is unwrapped; anything
 * else is the single token.
 */
function takeArgument(walker: Walker): Argument | null {
    const token = walker.items[walker.index];

    if (token === undefined) {
        return null;
    }

    walker.index += 1;

    if (token.kind === "group") {
        return { latex: renderItems(token.items, walker), braced: token.delimiter === "{" };
    }

    return { latex: renderAtomic(token, walker), braced: false };
}

/** A token rendered on its own, with no lookahead. */
function renderAtomic(token: EquationToken, walker: Walker): string {
    switch (token.kind) {
        case "number":
        case "command":
            return token.text;
        case "group":
            return renderGroup(token, walker);
        case "operator":
            return mapOperator(token.text);
        case "word":
            return renderWord(token.text);
    }
}

function mapOperator(text: string): string {
    return OPERATOR_SYMBOLS[text] ?? OPERATOR_SEQUENCE_MAP[text] ?? text;
}

function renderWord(text: string): string {
    const symbol = WORD_SYMBOLS[text];

    if (symbol !== undefined) {
        return symbol;
    }

    return NAMED_FUNCTION_SET.has(text) ? `\\${text}` : text;
}

/* -------------------------------------------------------- big operators --- */

/**
 * The limit grammar, which is where most of the leverage in this tool sits.
 *
 * Four spellings, all of them things people actually write:
 *
 *   sum i=1 to n of …              the subscript is everything before `to`
 *   integral from 0 to infinity of …
 *   lim as x->0 of …               only a subscript; `\lim` takes no upper limit
 *   sum_{i=1}^{n} …                already TeX, so nothing is consumed
 *
 * `of` is optional, and its absence is what bounds the limit: **without `of`, a
 * limit is one atom.** `integral from 0 to 1 x dx` has to stop the upper limit
 * at `1` somehow, and "everything until a keyword that is not there" would eat
 * the integrand. Writing `of` is how a reader says the limit is longer than
 * that, and the article says so.
 */
type Limits = {
    readonly sub: string;
    readonly sup: string;
};

function hasWordAhead(walker: Walker, words: readonly string[]): boolean {
    return walker.items
        .slice(walker.index)
        .some((token) => words.some((word) => isWord(token, word)));
}

function readLimitPart(walker: Walker, stopWords: readonly string[]): string {
    const collected: EquationToken[] = [];
    const bounded = hasWordAhead(walker, stopWords);

    while (walker.index < walker.items.length) {
        const token = walker.items[walker.index];

        if (stopWords.some((word) => isWord(token, word))) {
            break;
        }

        collected.push(token);
        walker.index += 1;

        if (!bounded) {
            break;
        }
    }

    return renderItems(collected, walker).trim();
}

function readLimits(walker: Walker): Limits {
    const next = walker.items[walker.index];

    // Already TeX: `sum_{i=1}^{n}`. The scripts are left to the operator
    // handler, which is the same code path a reader's own `x^2` takes.
    if (next?.kind === "operator" && (next.text === "_" || next.text === "^")) {
        return { sub: "", sup: "" };
    }

    if (isWord(next, LIMIT_KEYWORDS.as) || isWord(next, LIMIT_KEYWORDS.from)) {
        walker.index += 1;
    }

    const sub = readLimitPart(walker, [LIMIT_KEYWORDS.to, LIMIT_KEYWORDS.of]);

    if (!isWord(walker.items[walker.index], LIMIT_KEYWORDS.to)) {
        return { sub, sup: "" };
    }

    walker.index += 1;

    return { sub, sup: readLimitPart(walker, [LIMIT_KEYWORDS.of]) };
}

function renderBigOperator(command: string, walker: Walker): string {
    const { sub, sup } = readLimits(walker);

    if (isWord(walker.items[walker.index], LIMIT_KEYWORDS.of)) {
        walker.index += 1;
    }

    // Always braced, even for one character: `\sum_{i=1}^{n}` is what a TeX
    // author writes, and `\sum_i^n` reads as a different thing at a glance.
    const subscript = sub.length === 0 ? "" : `_{${sub}}`;
    const superscript = sup.length === 0 ? "" : `^{${sup}}`;

    return `${command}${subscript}${superscript}`;
}

/* ---------------------------------------------------------- atom stream --- */

function collectAtoms(
    items: readonly EquationToken[],
    notes: Notes,
    integral: boolean,
    options: ReadingOptions,
): Atom[] {
    const walker: Walker = { items, index: 0, notes, integral, options };
    const atoms: Atom[] = [];

    while (walker.index < walker.items.length) {
        const token = walker.items[walker.index];

        walker.index += 1;
        atoms.push(...renderToken(token, walker, atoms));
    }

    return atoms;
}

/**
 * One token, with lookahead. Returns a list because a couple of shapes — an
 * implied power, a script, a differential — attach to the atom before them.
 */
function renderToken(token: EquationToken, walker: Walker, atoms: Atom[]): Atom[] {
    switch (token.kind) {
        case "word":
            return renderWordToken(token, walker, atoms);
        case "operator":
            return renderOperatorToken(token, walker, atoms);
        case "number":
            return [atom(token.text, token)];
        case "command":
            return [{ ...atom(token.text, token), command: true }];
        case "group": {
            // A brace group straight after a command is that command's
            // argument, and keeps its braces. Anywhere else it is set notation.
            const previous = atoms[atoms.length - 1];
            const isArgument = token.delimiter === "{" && previous?.command === true;

            if (isArgument) {
                return [
                    {
                        latex: `{${renderItems(token.items, walker)}}`,
                        lead: lead(token),
                        boundary: false,
                        command: true,
                    },
                ];
            }

            // `(a+b)2` is a power for the same reason `x2` is, and by the same
            // reading: what closed the bracket is one thing, and the digits
            // touching it are what it is raised to.
            return [atom(attachImpliedDigits(renderGroup(token, walker), walker), token)];
        }
    }
}

/**
 * Digits sitting straight against what came before them.
 *
 * `x2` is a power, `H2O` is a subscript, `h264` is a name — three readings of
 * one shape, with nothing in the text to separate them. The option decides;
 * `readEquation` offers all three. The digits have to be unspaced, so `x 2`
 * stays two atoms.
 */
function attachImpliedDigits(rendered: string, walker: Walker): string {
    const next = walker.items[walker.index];

    if (next?.kind !== "number" || next.spaced) {
        return rendered;
    }

    walker.index += 1;

    if (walker.options.digits === "literal") {
        return `${rendered}${next.text}`;
    }

    const operator = walker.options.digits === "subscript" ? "_" : "^";

    walker.notes.add(operator === "_" ? "implied_subscript" : "implied_power");

    return `${rendered}${operator}${script({ latex: next.text, braced: false })}`;
}

function renderWordToken(
    token: Extract<EquationToken, { kind: "word" }>,
    walker: Walker,
    atoms: Atom[],
): Atom[] {
    const lower = token.text.toLowerCase();
    const big = BIG_OPERATORS[lower];

    if (big !== undefined) {
        // Marked as a boundary so a fraction in the body cannot reach back
        // across it: in `lim as x->0 of sin(x)/x` the numerator is `\sin(x)`,
        // never `\lim_{x \to 0} \sin(x)`.
        return [
            {
                latex: renderBigOperator(big, walker),
                lead: lead(token),
                boundary: true,
                command: true,
            },
        ];
    }

    const root = ROOT_FUNCTIONS[lower];

    if (root !== undefined) {
        const argument = takeArgument(walker);

        if (argument !== null) {
            return [atom(renderRoot(root, argument.latex), token)];
        }
    }

    // A differential closes an integral, and TeX's thin space is what separates
    // it from the integrand. The reader's own space is dropped in its favour —
    // `\,` *is* the space, and both together would be too wide.
    if (walker.integral && DIFFERENTIAL.test(lower) && atoms.length > 0) {
        return [{ latex: `\\,${lower}`, lead: "", boundary: false, command: false }];
    }

    const rendered = renderWord(token.text);

    // Only a single letter, and only one that is not already a symbol: `sin2` is
    // a mistyped function rather than `sin` squared, and `pi2` would be a second
    // guess stacked on the first.
    if (token.text.length === 1 && WORD_SYMBOLS[token.text] === undefined) {
        const attached = attachImpliedDigits(rendered, walker);

        if (attached !== rendered) {
            return [atom(attached, token)];
        }
    }

    return [{ ...atom(rendered, token), command: rendered.startsWith("\\") }];
}

function renderRoot(kind: "sqrt" | "cbrt" | "abs", argument: string): string {
    if (kind === "abs") {
        return `\\left|${argument}\\right|`;
    }

    return kind === "cbrt" ? `\\sqrt[3]{${argument}}` : `\\sqrt{${argument}}`;
}

function renderOperatorToken(
    token: Extract<EquationToken, { kind: "operator" }>,
    walker: Walker,
    atoms: Atom[],
): Atom[] {
    if (token.text === "^" || token.text === "_") {
        const argument = takeArgument(walker);
        const previous = atoms.pop();
        const body = argument === null ? "" : `${token.text}${script(argument)}`;

        if (previous === undefined) {
            return [atom(body, token)];
        }

        return [{ ...previous, latex: `${previous.latex}${body}` }];
    }

    // Left as a plain slash here. `foldFractions` is the only thing that decides
    // what a slash means, because the decision needs the whole atom stream.
    if (token.text === "/") {
        return [atom("/", token)];
    }

    const mapped = mapOperator(token.text);
    const boundary = TERM_BOUNDARIES.has(token.text);

    // An operator that became a control sequence is written with a space on
    // each side whatever the source did. Partly because that is how every TeX
    // author writes a relation, and partly because it has to be: `x->y` would
    // otherwise render as `x\toy`, which is not a command at all.
    if (mapped.startsWith("\\")) {
        return [{ latex: mapped, lead: " ", boundary, command: false, spaceAfter: true }];
    }

    return [{ ...atom(mapped, token), boundary }];
}

/* ------------------------------------------------------------ fractions --- */

/**
 * `a/b` to `\frac{a}{b}`, left to right.
 *
 * The only real decision in this file. A slash in plain text says nothing about
 * how far its numerator reaches — `n(n+1)(2n+1)/6` means the whole product over
 * six, and `x + y/2` means x plus half of y — so the rule is: **the numerator is
 * the term, and a term runs back to the nearest `+`, `-`, `=`, comma or big
 * operator.** The denominator runs forward on the same rule, and also stops at
 * the next slash, which is what makes `a/b/c` associate left as
 * `\frac{\frac{a}{b}}{c}`.
 *
 * It is a guess, and it is reported as one.
 */
function foldFractions(atoms: readonly Atom[], notes: Notes, options: ReadingOptions): Atom[] {
    const folded: Atom[] = [...atoms];

    const nextSlash = (after: number) =>
        folded.findIndex((item, at) => at > after && item.latex === "/" && !item.boundary);

    let index = nextSlash(-1);

    while (index !== -1) {
        let start = index;

        // The narrow reading takes only the factor touching the slash, which is
        // the other way `n(n+1)(2n+1)/6` can be meant — over six, or times
        // (2n+1)/6. The wide reading is the default because it is right far more
        // often; the narrow one is offered rather than argued about.
        const widen = options.fraction === "term";

        while (
            start > 0 &&
            !folded[start - 1].boundary &&
            folded[start - 1].latex !== "/" &&
            (widen || start === index)
        ) {
            start -= 1;
        }

        let end = index + 1;

        while (end < folded.length && !folded[end].boundary && folded[end].latex !== "/") {
            end += 1;
        }

        const numerator = joinAtoms(folded.slice(start, index)).trim();
        const denominator = joinAtoms(folded.slice(index + 1, end)).trim();

        // A slash with nothing on one side is a division somebody has not
        // finished typing. Left as a slash rather than turned into an empty
        // `\frac{}{}`, which KaTeX renders as a bare rule over nothing.
        if (numerator.length === 0 || denominator.length === 0) {
            index = nextSlash(index);
            continue;
        }

        notes.add("implied_fraction");
        folded.splice(start, end - start, {
            latex: `\\frac{${numerator}}{${denominator}}`,
            lead: folded[start].lead,
            boundary: false,
            command: true,
        });

        index = nextSlash(-1);
    }

    return folded;
}

/**
 * The separator between two atoms.
 *
 * Normally the reader's own spacing, which is what keeps `n(n+1)` joined and
 * `x + y` spread. Two things override it, and one is a correctness rule rather
 * than a taste: a control sequence made of letters swallows the letter after
 * it, so `\infty x` must never become `\inftyx`.
 */
function separator(joined: string, previous: Atom, next: Atom): string {
    if (previous.spaceAfter === true || next.lead.length > 0) {
        return " ";
    }

    return TRAILING_COMMAND.test(joined) && LEADING_LETTER.test(next.latex) ? " " : "";
}

function joinAtoms(atoms: readonly Atom[]): string {
    return atoms.reduce(
        (joined, item, index) =>
            index === 0
                ? item.latex
                : joined + separator(joined, atoms[index - 1], item) + item.latex,
        "",
    );
}

/* --------------------------------------------------------------- public --- */

/** Whether the line mentions an integral, which is what makes `dx` a differential. */
function mentionsIntegral(items: readonly EquationToken[]): boolean {
    return items.some((item) => {
        if (item.kind === "group") {
            return mentionsIntegral(item.items);
        }

        if (item.kind === "command") {
            return item.text.startsWith("\\int") || item.text.startsWith("\\oint");
        }

        return (
            item.kind === "word" &&
            (BIG_OPERATORS[item.text.toLowerCase()]?.includes("int") ?? false)
        );
    });
}

/** The reading applied when nobody has chosen one. */
export const DEFAULT_READING: ReadingOptions = { digits: "power", fraction: "term" };

/** One line, read one way. Pure and deterministic. */
export function convertLineWith(line: string, options: ReadingOptions): EquationReading {
    const items = tokenize(line);
    const notes: Notes = new Set();

    if (hasUnclosedGroup(items)) {
        notes.add("closed_group");
    }

    const atoms = collectAtoms(items, notes, mentionsIntegral(items), options);
    const latex = joinAtoms(foldFractions(atoms, notes, options)).trim();

    return { kind: kindOf(options), latex, notes: [...notes] };
}

function kindOf(options: ReadingOptions): ReadingKind {
    if (options.fraction === "factor") {
        return "narrowFraction";
    }

    return options.digits === "subscript"
        ? "subscript"
        : options.digits === "literal"
          ? "literal"
          : "power";
}

/**
 * The readings worth offering, best first.
 *
 * Order is fixed rather than scored, and that is deliberate. A heuristic that
 * spotted `H2O` as chemistry and promoted the subscript would be right often
 * enough to be trusted and wrong often enough to mislead — and the reader
 * looking at four labelled previews does not need it. What they need is for the
 * list to be in the same order every time.
 *
 * Duplicates collapse, so a line with nothing ambiguous in it yields exactly
 * one reading and the picker stays hidden.
 */
const CANDIDATES: readonly ReadingOptions[] = [
    { digits: "power", fraction: "term" },
    { digits: "subscript", fraction: "term" },
    { digits: "literal", fraction: "term" },
    { digits: "power", fraction: "factor" },
];

export function readEquation(line: string): readonly EquationReading[] {
    const seen = new Set<string>();
    const readings: EquationReading[] = [];

    for (const options of CANDIDATES) {
        const reading = convertLineWith(line, options);

        if (seen.has(reading.latex)) {
            continue;
        }

        seen.add(reading.latex);
        readings.push(reading);
    }

    return readings;
}

/** One line of plain text to one equation, with its alternatives attached. */
export function convertLine(line: string): ConvertedEquation {
    const readings = readEquation(line);
    const [best] = readings;

    return {
        source: line.trim(),
        latex: best.latex,
        notes: best.notes,
        // A single reading is not an alternative to anything, and a picker with
        // one row in it is furniture. The UI hides it below two.
        readings: readings.length > 1 ? readings : [],
    };
}

/**
 * The whole conversion, shared by the server-rendered first paint and the press
 * that runs it again.
 *
 * One equation per non-blank line. Blank lines are dropped rather than kept as
 * placeholders: these become numbered tabs, and a tab holding nothing is not
 * something a reader can use — the opposite of a bulk *text* tool, where a
 * blank row is what keeps two columns lined up.
 */
export function convertTextToLatex(text: string): EquationResult {
    if ([...text].length > MAX_EQUATION_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    // Before anything else looks at the text. A paste out of an assistant still
    // has its `$$` or `\[ \]` on, and those are punctuation to the converter —
    // and on their own lines they would each be read as an equation.
    const stripped = stripMathDelimiters(text);

    const lines = stripped.text
        .split(/\r\n|\r|\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length === 0) {
        return { ok: false, reason: "empty_input" };
    }

    if (lines.length > MAX_EQUATIONS) {
        return { ok: false, reason: "too_many_equations" };
    }

    return { ok: true, equations: lines.map(convertLine), display: stripped.display };
}
