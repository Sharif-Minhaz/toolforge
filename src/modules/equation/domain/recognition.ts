import { checkImageFile, type ImageFileFacts } from "@/modules/tools/domain/image-file";

import type { ConvertedEquation, RecognitionFailureReason, RecognizedEquation } from "../types";
import {
    EQUATION_IMAGE_LIMITS,
    MAX_RECOGNIZED_EQUATIONS,
    MAX_RECOGNIZED_LATEX_LENGTH,
    MIN_EQUATION_IMAGE_BYTES,
} from "./constants";

/**
 * The pure half of image recognition: what may be uploaded, and what a reply
 * means once it arrives.
 *
 * Everything here runs without a network, a `File` or a request, which is what
 * makes the rules testable. The one function that actually reaches the model
 * lives in `repository/math-ocr.ts` and does nothing but the fetch.
 */

export type EquationImageCheck =
    { readonly ok: true } | { readonly ok: false; readonly reason: RecognitionFailureReason };

/**
 * Whether a picture is worth a model call.
 *
 * Four answers rather than three. The shared check knows empty, wrong type and
 * too big; the floor is this recognizer's own, and it keeps its own name — a
 * reader whose 200-byte screenshot is refused must not be told it was empty,
 * because it was not and "empty" tells them nothing to do about it.
 *
 * Order matters: the size questions bracket the type question, so a zero-byte
 * pick — which the browser reports with no type at all — is still called empty.
 */
export function checkEquationImage(file: ImageFileFacts): EquationImageCheck {
    const checked = checkImageFile(file, EQUATION_IMAGE_LIMITS);

    if (!checked.ok) {
        return { ok: false, reason: checked.reason };
    }

    return file.size < MIN_EQUATION_IMAGE_BYTES ? { ok: false, reason: "too_small" } : { ok: true };
}

/**
 * Markup a model wraps around an answer it was told not to wrap.
 *
 * The recognizer strips these upstream already. They are stripped again here
 * for the reason every boundary re-checks: the worker is a separate deployment
 * on its own release cycle, and a fenced ``` reaching the KaTeX renderer is a
 * red error box where an equation should be. Cheap, and it fails safe.
 */
const CODE_FENCE = /^\s*```(?:latex|tex|json)?|```\s*$/gi;

const SURROUNDING_DOLLARS = /^\${1,2}|\${1,2}$/g;

/** One `latex` field, cleaned of everything the prompt asked the model to omit. */
export function cleanRecognizedLatex(raw: string): string {
    return raw.replace(CODE_FENCE, "").replace(SURROUNDING_DOLLARS, "").trim();
}

/**
 * The recognizer's equations, turned into the shape the rest of the tool
 * already speaks.
 *
 * This is the seam the whole feature was built around: past this function
 * nothing — not the editor, not the preview, not the copy formats, not the
 * export — can tell whether an equation was translated from text in the tab or
 * read out of a picture by a model.
 *
 * Two things are enforced here rather than trusted:
 *
 * - **The count.** The tab strip has a ceiling, and a model that returns forty
 *   equations must not be able to raise it. The extras are dropped, and the
 *   caller is told how many so it can say so.
 * - **The length.** A runaway generation is a wall of LaTeX, not a better
 *   answer, and the editor below has its own ceiling.
 *
 * Every equation carries the `recognized` note, because a transcription is a
 * reading of a picture and the reader has to check it against the preview.
 */
export type MappedRecognition = {
    readonly equations: readonly ConvertedEquation[];
    /** True when the recognizer returned more than the tab strip can carry. */
    readonly truncated: boolean;
    /** The model's own display/inline judgement for the first equation. */
    readonly displayMode: boolean;
};

export function toConvertedEquations(
    recognized: readonly RecognizedEquation[],
    /** Labels each tab when the source was a picture rather than a typed line. */
    label: (index: number) => string,
): MappedRecognition {
    const usable = recognized
        .map((equation) => ({
            latex: cleanRecognizedLatex(equation.latex).slice(0, MAX_RECOGNIZED_LATEX_LENGTH),
            displayMode: equation.displayMode,
        }))
        .filter((equation) => equation.latex.length > 0);

    const kept = usable.slice(0, MAX_RECOGNIZED_EQUATIONS);

    return {
        equations: kept.map((equation, index) => ({
            // There is no typed line to show, so the source is the tab's own
            // name. It is what the export writes above each block, and "read
            // from the picture" is the truest thing that can be said there.
            source: label(index),
            latex: equation.latex,
            notes: ["recognized"],
            // No alternatives: nobody on this side guessed. The model read the
            // picture one way, and a second reading of its answer would be this
            // tool guessing about a guess.
            readings: [],
        })),
        truncated: usable.length > kept.length,
        displayMode: kept[0]?.displayMode ?? true,
    };
}
