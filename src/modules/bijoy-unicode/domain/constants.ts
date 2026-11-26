import type { BijoyDirection } from "../types";

/**
 * Ceiling on one conversion. Both directions are a couple of linear passes, and
 * two hundred thousand characters is a book chapter of dense Bangla — a whole
 * pasted Word document, which is what people actually bring here.
 */
export const MAX_BIJOY_INPUT_LENGTH = 200_000;

/** Longest `?text=` value accepted from a shared link. */
export const MAX_SHARED_TEXT_LENGTH = 2048;

/**
 * The common case: an old SutonnyMJ document that has to become text that
 * works on the web, on a phone and in a search box.
 */
export const DEFAULT_BIJOY_DIRECTION: BijoyDirection = "to-unicode";

/**
 * The national anthem's opening line, the sentence every Bijoy typist has
 * typed. Data rather than copy: it is the same in either locale, because it is
 * an example of the encoding rather than a sentence about it.
 */
export const BIJOY_SAMPLE = {
    bijoy: "Avgvi \u2020mvbvi evsjv, Avwg \u2020Zvgvq fv\u2021jvevwm|",
    unicode: "আমার সোনার বাংলা, আমি তোমায় ভালোবাসি\u0964",
} as const;
