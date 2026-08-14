import { TEXT_CASES, type TextCase } from "../types";
import { CASE_SAMPLE } from "./constants";
import { convertCase } from "./convert";

export type CaseSample = {
    readonly textCase: TextCase;
    /** `CASE_SAMPLE` put through this case, for the chip and the article table. */
    readonly sample: string;
};

/**
 * One sample per case, built once at module load by the converter itself.
 *
 * Deliberately not a hand-written table. A picker whose chips are typed out by
 * an author is a second implementation of the tool, and the first time the two
 * disagree the chip is the one a reader believes.
 *
 * The options are pinned rather than taken from the reader's: the chip has to
 * show what the *case* does, and a sample that changed when a switch was
 * flipped would make the picker look like it had moved under them.
 */
export const CASE_SAMPLES: readonly CaseSample[] = TEXT_CASES.map((textCase) => {
    const result = convertCase(CASE_SAMPLE, {
        textCase,
        perLine: false,
        preserveAcronyms: false,
    });

    return { textCase, sample: result.ok ? result.text : CASE_SAMPLE };
});
