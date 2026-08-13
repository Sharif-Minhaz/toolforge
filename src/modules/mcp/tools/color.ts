import { z } from "zod";

import { DEFAULT_FORMAT_OPTIONS, MAX_COLOR_INPUT_LENGTH } from "@/modules/color/domain/constants";
import { getContrastReport } from "@/modules/color/domain/contrast";
import { formatAll } from "@/modules/color/domain/format";
import { parseColor } from "@/modules/color/domain/parse";
import { colorNotationSchema, hexCasingSchema } from "@/modules/color/validation/color-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

export const colorConvertTool = defineMcpTool({
    toolId: "color",
    verb: "convert",
    title: "Convert a colour between formats",
    description:
        "Read a colour written as hex, `rgb()`, `hsl()`, `hsv()`, `cmyk()`, `oklch()` or a CSS named colour, and return it in every one of those notations at once, plus its WCAG contrast against black and white. Flags any format that could not carry the alpha channel rather than dropping it silently.",
    kind: "offline",
    inputSchema: z.object({
        color: z
            .string()
            .max(MAX_COLOR_INPUT_LENGTH)
            .describe(
                "The colour in any supported notation, e.g. `#7c3aed` or `oklch(60% .2 280)`",
            ),
        notation: colorNotationSchema
            .default(DEFAULT_FORMAT_OPTIONS.notation)
            .describe("`modern` writes `rgb(0 0 0 / 50%)`; `legacy` writes `rgba(0, 0, 0, 0.5)`"),
        hexCasing: hexCasingSchema.default(DEFAULT_FORMAT_OPTIONS.hexCasing),
    }),
    run: ({ color, ...options }) => {
        const parsed = parseColor(color);

        if (!parsed.ok) {
            return refuseWithReason("Colour parser", parsed.reason);
        }

        const formats = formatAll(parsed.color, options);
        const contrast = getContrastReport(parsed.color);
        const hex = formats.find((entry) => entry.format === "hex")?.value ?? color;

        return succeed(`${hex} — read as ${parsed.syntax}`, {
            readAs: parsed.syntax,
            formats: formats.map((entry) => ({
                format: entry.format,
                value: entry.value,
                alphaDropped: entry.alphaDropped,
            })),
            contrast: {
                onBlack: { ...contrast.onBlack },
                onWhite: { ...contrast.onWhite },
                bestTextOn: contrast.bestTextOn,
            },
        });
    },
});
