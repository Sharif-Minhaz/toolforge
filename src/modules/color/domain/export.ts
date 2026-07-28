import type { DownloadFile } from "@/modules/tools/types";
import { COLOR_FORMATS, type ColorExportRequest } from "../types";
import { formatColor } from "./format";
import { buildColorScale } from "./scale";

const MIME_TYPE = "text/css;charset=utf-8";

/** `color-7c5cff-20260729T101500Z.css` — sortable and self-describing. */
export function buildColorExportFilename(hex: string, generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `color-${hex.replace("#", "").toLowerCase()}-${stamp}.css`;
}

/**
 * A stylesheet rather than a list of values: the generated scale is meant to be
 * pasted into a `@theme` or `:root` block, and the alternate notations are
 * useful as a comment beside it.
 */
export function createColorExportFile(request: ColorExportRequest): DownloadFile {
    const { color, options } = request;
    const hex = formatColor("hex", color, options);
    const notations = COLOR_FORMATS.map(
        (format) => ` * ${format.padEnd(5)} ${formatColor(format, color, options)}`,
    );
    const scale = buildColorScale(color, options).map(
        (stop) => `    --color-brand-${stop.step}: ${stop.hex};`,
    );

    const content = [
        "/*",
        ` * ${hex}`,
        ...notations,
        " */",
        "",
        ":root {",
        `    --color-brand: ${hex};`,
        ...scale,
        "}",
        "",
    ].join("\n");

    return {
        filename: buildColorExportFilename(hex, request.generatedAt),
        mimeType: MIME_TYPE,
        content,
    };
}
