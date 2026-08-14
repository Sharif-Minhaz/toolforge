"use client";

import { useTranslations } from "next-intl";

import { IDENTIFIER_CASE_NAMES, isIdentifierCase } from "../domain/constants";
import type { TextCase } from "../types";

/**
 * What to call a case, in the reader's language where there is one.
 *
 * The two families are named from two different places, and that is the point:
 * `snake_case` is a token every developer already reads in English and a
 * translated one would name nothing, while "Sentence case" is an ordinary
 * phrase that has a Bangla equivalent. Both the picker and the workbench's
 * status line ask this rather than each deciding for itself.
 */
export function useCaseName(): (textCase: TextCase) => string {
    const t = useTranslations("textCase.cases");

    return (textCase) => {
        if (isIdentifierCase(textCase)) {
            return IDENTIFIER_CASE_NAMES[textCase];
        }

        // Narrowed to `ProseCase` by the guard above — a literal union, so the
        // message key is checked at compile time rather than at render.
        return t(textCase);
    };
}
