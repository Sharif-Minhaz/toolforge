import { describe, expect, test } from "bun:test";

import {
    ALLOWED_EQUATION_IMAGE_TYPES,
    MAX_EQUATION_IMAGE_BYTES,
    MAX_RECOGNIZED_EQUATIONS,
    MAX_RECOGNIZED_LATEX_LENGTH,
    MIN_EQUATION_IMAGE_BYTES,
} from "@/modules/equation/domain/constants";
import {
    checkEquationImage,
    cleanRecognizedLatex,
    toConvertedEquations,
} from "@/modules/equation/domain/recognition";
import { recognizerResponseSchema } from "@/modules/equation/validation/equation";
import type { RecognizedEquation } from "@/modules/equation/types";

const GOOD_SIZE = MIN_EQUATION_IMAGE_BYTES * 4;

function label(index: number): string {
    return `Equation ${index + 1}`;
}

function recognized(latex: string, displayMode = true): RecognizedEquation {
    return { latex, displayMode };
}

describe("checkEquationImage", () => {
    test("accepts every type the recognizer is trained on", () => {
        for (const type of ALLOWED_EQUATION_IMAGE_TYPES) {
            expect(checkEquationImage({ type, size: GOOD_SIZE })).toEqual({ ok: true });
        }
    });

    test("refuses a type the model would answer badly rather than accepting it", () => {
        expect(checkEquationImage({ type: "image/gif", size: GOOD_SIZE })).toEqual({
            ok: false,
            reason: "unsupported_type",
        });
    });

    test("calls a zero-byte pick empty, not untyped", () => {
        // A browser reports `type: ""` for a zero-byte file, so the order of the
        // checks is what decides which of two true things the reader is told.
        expect(checkEquationImage({ type: "", size: 0 })).toEqual({
            ok: false,
            reason: "empty_file",
        });
    });

    test("keeps the floor as its own refusal rather than folding it into empty", () => {
        expect(checkEquationImage({ type: "image/png", size: 200 })).toEqual({
            ok: false,
            reason: "too_small",
        });
    });

    test("accepts a file exactly on the floor and refuses one under it", () => {
        expect(checkEquationImage({ type: "image/png", size: MIN_EQUATION_IMAGE_BYTES }).ok).toBe(
            true,
        );
        expect(
            checkEquationImage({ type: "image/png", size: MIN_EQUATION_IMAGE_BYTES - 1 }).ok,
        ).toBe(false);
    });

    test("refuses a file past the ceiling, and accepts one exactly on it", () => {
        expect(checkEquationImage({ type: "image/png", size: MAX_EQUATION_IMAGE_BYTES }).ok).toBe(
            true,
        );
        expect(
            checkEquationImage({ type: "image/png", size: MAX_EQUATION_IMAGE_BYTES + 1 }),
        ).toEqual({ ok: false, reason: "too_large" });
    });

    test("reads a type that arrived with parameters or odd casing", () => {
        expect(checkEquationImage({ type: "IMAGE/PNG; charset=binary", size: GOOD_SIZE })).toEqual({
            ok: true,
        });
    });
});

describe("cleanRecognizedLatex", () => {
    test("strips a code fence the model was told not to write", () => {
        expect(cleanRecognizedLatex("```latex\n\\frac{a}{b}\n```")).toBe("\\frac{a}{b}");
        expect(cleanRecognizedLatex("```\nx^2\n```")).toBe("x^2");
    });

    test("strips surrounding dollars, single or double", () => {
        expect(cleanRecognizedLatex("$x^2$")).toBe("x^2");
        expect(cleanRecognizedLatex("$$x^2$$")).toBe("x^2");
    });

    test("leaves a dollar that is part of the maths alone", () => {
        expect(cleanRecognizedLatex("a \\$ b")).toBe("a \\$ b");
    });

    test("leaves clean LaTeX exactly as it arrived", () => {
        expect(cleanRecognizedLatex("\\sum_{i=1}^{n} i^2")).toBe("\\sum_{i=1}^{n} i^2");
    });
});

describe("toConvertedEquations", () => {
    test("turns a reply into the shape the rest of the tool already speaks", () => {
        const mapped = toConvertedEquations([recognized("x^2 + y^2 = r^2")], label);

        expect(mapped.equations).toEqual([
            {
                source: "Equation 1",
                latex: "x^2 + y^2 = r^2",
                notes: ["recognized"],
                readings: [],
            },
        ]);
        expect(mapped.truncated).toBe(false);
    });

    test("offers no alternative readings, because nobody on this side guessed", () => {
        // A second reading of a model's answer would be this tool guessing about
        // a guess. The reader edits the source instead.
        for (const equation of toConvertedEquations([recognized("H2O")], label).equations) {
            expect(equation.readings).toEqual([]);
        }
    });

    test("marks every equation as recognized, so the reader is told to check it", () => {
        const mapped = toConvertedEquations([recognized("a"), recognized("b")], label);

        for (const equation of mapped.equations) {
            expect(equation.notes).toEqual(["recognized"]);
        }
    });

    test("carries the model's display judgement from the first equation", () => {
        expect(toConvertedEquations([recognized("a", false)], label).displayMode).toBe(false);
        expect(toConvertedEquations([recognized("a", true)], label).displayMode).toBe(true);
    });

    test("falls back to display mode when there is nothing to read it from", () => {
        expect(toConvertedEquations([], label).displayMode).toBe(true);
    });

    test("drops an equation whose LaTeX cleaned away to nothing", () => {
        expect(toConvertedEquations([recognized("```"), recognized("x")], label).equations).toEqual(
            [{ source: "Equation 1", latex: "x", notes: ["recognized"], readings: [] }],
        );
    });

    test("caps the count the tab strip has to carry, and says that it did", () => {
        // The one number on this path nobody on this side controls: a model
        // that returns forty equations must not be able to raise the ceiling.
        const many = Array.from({ length: MAX_RECOGNIZED_EQUATIONS + 5 }, (_, index) =>
            recognized(`x^${index}`),
        );
        const mapped = toConvertedEquations(many, label);

        expect(mapped.equations).toHaveLength(MAX_RECOGNIZED_EQUATIONS);
        expect(mapped.truncated).toBe(true);
    });

    test("cuts a runaway generation to the ceiling the editor holds", () => {
        const huge = recognized("x".repeat(MAX_RECOGNIZED_LATEX_LENGTH + 500));
        const mapped = toConvertedEquations([huge], label);

        expect(mapped.equations[0].latex).toHaveLength(MAX_RECOGNIZED_LATEX_LENGTH);
    });

    test("numbers the tabs, since a picture has no typed line to name them with", () => {
        const mapped = toConvertedEquations([recognized("a"), recognized("b")], label);

        expect(mapped.equations.map((equation) => equation.source)).toEqual([
            "Equation 1",
            "Equation 2",
        ]);
    });
});

describe("recognizerResponseSchema", () => {
    test("reads a successful reply", () => {
        const parsed = recognizerResponseSchema.safeParse({
            success: true,
            equations: [{ latex: "x^2", displayMode: true }],
        });

        expect(parsed.success).toBe(true);
    });

    test("reads the refusal shape, which arrives with HTTP 200", () => {
        // `EQUATION_NOT_DETECTED` is a 200: the call worked and the answer is
        // that there is no equation. The body decides, never the status.
        const parsed = recognizerResponseSchema.safeParse({
            success: false,
            equations: [],
            error: { code: "EQUATION_NOT_DETECTED", message: "No equation." },
        });

        expect(parsed.success && parsed.data.error?.code).toBe("EQUATION_NOT_DETECTED");
    });

    test("survives a model that ignored the schema it was given", () => {
        // The fields are `unknown` on purpose: a model that answers with a
        // number where a string was demanded still returns 200, and the domain
        // decides what a half-filled answer means.
        const parsed = recognizerResponseSchema.safeParse({
            success: true,
            equations: [{ latex: 42, displayMode: "yes" }],
        });

        expect(parsed.success).toBe(true);
    });

    test("refuses a body that is not the recognizer's shape at all", () => {
        expect(recognizerResponseSchema.safeParse("gateway timeout").success).toBe(false);
        expect(recognizerResponseSchema.safeParse({ equations: "none" }).success).toBe(false);
    });
});
