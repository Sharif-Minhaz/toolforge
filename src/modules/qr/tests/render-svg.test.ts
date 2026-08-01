import { describe, expect, test } from "bun:test";

import { DEFAULT_OPTIONS, TRANSPARENT_BACKGROUND } from "@/modules/qr/domain/constants";
import { encodeQr } from "@/modules/qr/domain/encoder";
import { createQrSvgFile, buildQrFilename } from "@/modules/qr/domain/export";
import {
    hasScannableContrast,
    resolveErrorLevel,
    resolveLogoBacking,
    supportsLevelChoice,
} from "@/modules/qr/domain/options";
import { renderQrSvg } from "@/modules/qr/domain/render-svg";
import { QR_DOT_STYLES, QR_EYE_STYLES, type QrMatrix, type QrStyle } from "@/modules/qr/types";

function matrixOf(text = "https://example.com"): QrMatrix {
    const result = encodeQr(text, "M");

    if (!result.ok) {
        throw new Error(`could not encode: ${result.reason}`);
    }

    return result.matrix;
}

const style: QrStyle = {
    foreground: "#101010",
    background: "#fefefe",
    dotStyle: "square",
    eyeStyle: "square",
    margin: 4,
    logo: null,
};

describe("renderQrSvg — document", () => {
    const matrix = matrixOf();

    test("the viewBox covers the code and both quiet zones", () => {
        const svg = renderQrSvg(matrix, style);

        expect(svg).toContain(`viewBox="0 0 ${matrix.size + 8} ${matrix.size + 8}"`);
        expect(svg.startsWith("<svg xmlns=")).toBe(true);
        expect(svg.endsWith("</svg>")).toBe(true);
    });

    test("a zero margin removes the quiet zone from the viewBox", () => {
        expect(renderQrSvg(matrix, { ...style, margin: 0 })).toContain(
            `viewBox="0 0 ${matrix.size} ${matrix.size}"`,
        );
    });

    test("pixel dimensions are written only when asked for", () => {
        // The background rectangle carries a width of its own, so the check has
        // to look at the opening `<svg>` tag rather than the whole document.
        const openingTag = (svg: string) => svg.slice(0, svg.indexOf(">") + 1);

        expect(openingTag(renderQrSvg(matrix, style))).not.toContain(" width=");
        expect(openingTag(renderQrSvg(matrix, style, { pixelSize: 512 }))).toContain(
            ' width="512" height="512"',
        );
    });

    test("a title is escaped rather than injected", () => {
        const svg = renderQrSvg(matrix, style, { title: 'QR & <friends> "here"' });

        expect(svg).toContain("<title>QR &amp; &lt;friends&gt; &quot;here&quot;</title>");
        expect(svg).not.toContain("<friends>");
    });

    test("no title element when none was given", () => {
        expect(renderQrSvg(matrix, style)).not.toContain("<title>");
    });
});

describe("renderQrSvg — colours", () => {
    const matrix = matrixOf();

    test("the background is a rectangle behind everything", () => {
        expect(renderQrSvg(matrix, style)).toContain(
            `<rect width="${matrix.size + 8}" height="${matrix.size + 8}" fill="#fefefe"/>`,
        );
    });

    test("a transparent background draws no rectangle at all", () => {
        const svg = renderQrSvg(matrix, { ...style, background: TRANSPARENT_BACKGROUND });

        expect(svg).not.toContain("<rect");
        expect(svg).toContain('fill="#101010"');
    });
});

describe("renderQrSvg — styles", () => {
    const matrix = matrixOf();

    for (const dotStyle of QR_DOT_STYLES) {
        test(`${dotStyle} dots produce a non-empty body path`, () => {
            const svg = renderQrSvg(matrix, { ...style, dotStyle });
            const body = /<path fill="#101010" d="([^"]*)"\/>/.exec(svg);

            expect(body).not.toBeNull();
            expect(body?.[1].length ?? 0).toBeGreaterThan(100);
        });
    }

    for (const eyeStyle of QR_EYE_STYLES) {
        test(`${eyeStyle} eyes draw three rings and three centres`, () => {
            const svg = renderQrSvg(matrix, { ...style, eyeStyle });
            const ring = /fill-rule="evenodd" d="([^"]*)"/.exec(svg);

            // Two subpaths per eye — the 7×7 outline and the 5×5 hole.
            expect((ring?.[1].match(/M/g) ?? []).length).toBe(6);
        });
    }

    test("square styling asks for crisp edges, curved styling for precision", () => {
        expect(renderQrSvg(matrix, style)).toContain('shape-rendering="crispEdges"');
        expect(renderQrSvg(matrix, { ...style, dotStyle: "smooth" })).toContain(
            'shape-rendering="geometricPrecision"',
        );
        expect(renderQrSvg(matrix, { ...style, eyeStyle: "dot" })).toContain(
            'shape-rendering="geometricPrecision"',
        );
    });

    test("smooth dots emit arcs and square dots do not", () => {
        expect(renderQrSvg(matrix, { ...style, dotStyle: "smooth" })).toContain("A0.5 0.5 0 0 1");
        expect(renderQrSvg(matrix, { ...style, dotStyle: "square" })).not.toContain("A0.5");
    });
});

describe("renderQrSvg — logo", () => {
    const matrix = matrixOf();
    const logo = { dataUrl: "data:image/png;base64,AAA=", scale: 0.2 };

    test("draws a backing plate and the image, centred", () => {
        const svg = renderQrSvg(matrix, { ...style, logo });
        const side = matrix.size * 0.2;
        const origin = 4 + (matrix.size - side) / 2;

        expect(svg).toContain(`<image href="data:image/png;base64,AAA="`);
        expect(svg).toContain(`x="${Math.round(origin * 1_000) / 1_000}"`);
        expect(svg).toContain(`width="${Math.round(side * 1_000) / 1_000}"`);
    });

    test("the backing plate follows the background colour", () => {
        expect(renderQrSvg(matrix, { ...style, logo })).toContain('<path fill="#fefefe"');
    });

    test("over a transparent code the plate falls back to white", () => {
        const svg = renderQrSvg(matrix, {
            ...style,
            background: TRANSPARENT_BACKGROUND,
            logo,
        });

        expect(svg).toContain('<path fill="#ffffff"');
    });

    test("an ampersand in the data URL is escaped", () => {
        const svg = renderQrSvg(matrix, {
            ...style,
            logo: { ...logo, dataUrl: "data:image/svg+xml,<svg a='1'&b/>" },
        });

        expect(svg).toContain("&amp;b/&gt;");
        expect(svg).not.toContain("'1'&b");
    });
});

describe("option interactions", () => {
    test("a logo takes the level choice away and forces H", () => {
        expect(supportsLevelChoice({ logo: null })).toBe(true);
        expect(resolveErrorLevel({ logo: null, level: "L" })).toBe("L");

        const logo = { dataUrl: "data:image/png;base64,AAA=", scale: 0.2 };

        expect(supportsLevelChoice({ logo })).toBe(false);
        expect(resolveErrorLevel({ logo, level: "L" })).toBe("H");
    });

    test("the logo backing resolves to the background unless it is transparent", () => {
        expect(resolveLogoBacking({ background: "#123456" })).toBe("#123456");
        expect(resolveLogoBacking({ background: TRANSPARENT_BACKGROUND })).toBe("#ffffff");
    });

    test("contrast is judged, and unknowable contrast is never a complaint", () => {
        expect(hasScannableContrast({ foreground: "#000000", background: "#ffffff" })).toBe(true);
        expect(hasScannableContrast({ foreground: "#777777", background: "#888888" })).toBe(false);
        expect(hasScannableContrast({ foreground: "#3b0764", background: "#ffffff" })).toBe(true);
        expect(
            hasScannableContrast({ foreground: "#000000", background: TRANSPARENT_BACKGROUND }),
        ).toBe(true);
        expect(hasScannableContrast({ foreground: "not-a-colour", background: "#ffffff" })).toBe(
            true,
        );
    });

    test("the defaults are a code that scans", () => {
        expect(hasScannableContrast(DEFAULT_OPTIONS)).toBe(true);
        expect(resolveErrorLevel(DEFAULT_OPTIONS)).toBe("M");
    });
});

describe("export", () => {
    const generatedAt = new Date("2026-08-01T10:15:00.000Z");

    test("filenames are sortable and say what they hold", () => {
        expect(buildQrFilename("wifi", "png", generatedAt)).toBe("qr-wifi-20260801T101500Z.png");
        expect(buildQrFilename("contact", "svg", generatedAt)).toBe(
            "qr-contact-20260801T101500Z.svg",
        );
    });

    test("a downloaded SVG is a document, not a fragment", () => {
        const file = createQrSvgFile({ kind: "url", svg: "<svg/>", generatedAt });

        expect(file.filename).toBe("qr-url-20260801T101500Z.svg");
        expect(file.mimeType).toBe("image/svg+xml;charset=utf-8");
        expect(file.content).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<svg/>\n');
    });
});
