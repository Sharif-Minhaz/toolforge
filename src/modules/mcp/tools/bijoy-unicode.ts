import { z } from "zod";

import { DEFAULT_BIJOY_DIRECTION } from "@/modules/bijoy-unicode/domain/constants";
import { convertBijoy } from "@/modules/bijoy-unicode/domain/convert";
import {
    bijoyDirectionSchema,
    bijoyInputSchema,
} from "@/modules/bijoy-unicode/validation/bijoy-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

export const bijoyUnicodeConvertTool = defineMcpTool({
    toolId: "bijoy-unicode",
    verb: "convert",
    title: "Convert Bangla between Bijoy and Unicode",
    description:
        "Convert Bangla text between the legacy Bijoy encoding (SutonnyMJ and the other *MJ fonts, where Bangla is stored as Latin letters such as `Avgvi †mvbvi evsjv`) and Unicode Bangla (`আমার সোনার বাংলা`). Bijoy to Unicode reorders pre-base vowel signs and the reph into spoken order and reads every conjunct glyph; Unicode to Bijoy produces the codes a SutonnyMJ font draws as the same text. Use it to make an old Bijoy document searchable and readable anywhere, or to prepare Unicode text for software that only renders Bijoy fonts.",
    kind: "offline",
    inputSchema: z.object({
        text: bijoyInputSchema.describe("The text to convert"),
        direction: bijoyDirectionSchema
            .default(DEFAULT_BIJOY_DIRECTION)
            .describe(
                "`to-unicode` reads Bijoy text and writes Unicode Bangla; `to-bijoy` reads Unicode Bangla and writes Bijoy codes",
            ),
    }),
    run: ({ text, direction }) => {
        const result = convertBijoy(text, direction);

        if (!result.ok) {
            return refuseWithReason("Bijoy ↔ Unicode converter", result.reason, { direction });
        }

        return succeed(result.text, {
            text: result.text,
            direction,
            characters: result.stats.characters,
            words: result.stats.words,
            lines: result.stats.lines,
            // A caller has no warning strip to read, so the likely wrong
            // direction is said in the answer itself.
            notice: result.notice,
        });
    },
});
