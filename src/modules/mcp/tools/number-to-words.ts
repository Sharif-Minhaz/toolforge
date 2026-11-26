import { z } from "zod";

import { DEFAULT_NUMBER_WORDS_OPTIONS } from "@/modules/number-to-words/domain/constants";
import { convertNumberToWords } from "@/modules/number-to-words/domain/convert";
import {
    currencySchema,
    englishScaleSchema,
    letterCaseSchema,
    numberFormatSchema,
    numberInputSchema,
} from "@/modules/number-to-words/validation/number-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

export const numberToWordsConvertTool = defineMcpTool({
    toolId: "number-to-words",
    verb: "convert",
    title: "Spell a number out in English and Bangla words",
    description:
        "Write a number in words in English and Bangla at once — `1250500.75` is `twelve lakh fifty thousand five hundred point seven five` and `বারো লক্ষ পঞ্চাশ হাজার পাঁচ শত দশমিক সাত পাঁচ`. As a currency amount it writes the way a cheque does, with the minor unit and `only` / `মাত্র`. English counts in millions, billions and on through duotrigintillion (exactly 10^100 reads as `one googol`), or on the South Asian ladder; Bangla always counts on that ladder — হাজার, লক্ষ, কোটি, আরব, খরব, নীল, পদ্ম, শঙ্খ. Accepts Western or Bangla digits and grouping commas, up to 102 digits before the point.",
    kind: "offline",
    inputSchema: z.object({
        // A string, not a JSON number: a number loses precision past fifteen
        // digits, and the tool reads a hundred and two.
        number: numberInputSchema.describe(
            "The number, as a string: digits (Western or Bangla), an optional sign and decimal point, and optional commas or spaces between digit groups",
        ),
        format: numberFormatSchema
            .default(DEFAULT_NUMBER_WORDS_OPTIONS.format)
            .describe(
                "`cardinal` reads the value with decimals digit by digit; `currency` reads it as money with the decimals as hundredths",
            ),
        currency: currencySchema
            .default(DEFAULT_NUMBER_WORDS_OPTIONS.currency)
            .describe("Unit names for a `currency` amount; ignored for a cardinal"),
        scale: englishScaleSchema
            .default(DEFAULT_NUMBER_WORDS_OPTIONS.scale)
            .describe(
                "How the English line groups: `south-asian` (lakh, crore) or `international` (million, billion)",
            ),
        letterCase: letterCaseSchema
            .default(DEFAULT_NUMBER_WORDS_OPTIONS.letterCase)
            .describe("Letter case of the English line; Bangla has none"),
        britishAnd: z
            .boolean()
            .default(DEFAULT_NUMBER_WORDS_OPTIONS.britishAnd)
            .describe("Write `one hundred and five` rather than `one hundred five`"),
        appendOnly: z
            .boolean()
            .default(DEFAULT_NUMBER_WORDS_OPTIONS.appendOnly)
            .describe("End a currency amount with `only` / `মাত্র`; ignored for a cardinal"),
    }),
    run: ({ number, ...options }) => {
        const result = convertNumberToWords(number, options);

        if (!result.ok) {
            return refuseWithReason("Number to words", result.reason, {
                position: result.position ?? null,
            });
        }

        return succeed(`${result.english}\n${result.bangla}`, {
            english: result.english,
            bangla: result.bangla,
            numeral: result.numeral,
            banglaNumeral: result.banglaNumeral,
        });
    },
});
