import type { ColorParseResult, Hsva, Rgb } from "../types";
import { MAX_COLOR_INPUT_LENGTH } from "./constants";
import {
    clamp,
    cmykToRgb,
    hslToHsv,
    normalizeHue,
    oklchToRgb,
    rgbToHsv,
    roundRgb,
} from "./convert";
import { CSS_NAMED_COLOR_MAP } from "./css-colors";

/**
 * Reads a colour written in any notation the tool understands and hands back
 * the picker's HSVA form.
 *
 * Out-of-range channels are clamped rather than rejected, which is what a
 * browser does with `rgb(300 0 0)`. Pasting what a stylesheet contains should
 * produce what the browser shows, not an error.
 */

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

function readNumber(token: string): number | null {
    return NUMBER.test(token) ? Number.parseFloat(token) : null;
}

/** A bare number, or a percentage of `full`. */
function readScalar(token: string, full: number): number | null {
    if (token.endsWith("%")) {
        const percent = readNumber(token.slice(0, -1));

        return percent === null ? null : (percent / 100) * full;
    }

    return readNumber(token);
}

const ANGLE_UNITS: Readonly<Record<string, number>> = {
    deg: 1,
    grad: 360 / 400,
    rad: 180 / Math.PI,
    turn: 360,
};

function readAngle(token: string): number | null {
    for (const [unit, degreesPer] of Object.entries(ANGLE_UNITS)) {
        if (token.endsWith(unit)) {
            const value = readNumber(token.slice(0, -unit.length));

            return value === null ? null : value * degreesPer;
        }
    }

    const bare = readNumber(token);

    return bare === null ? null : bare;
}

/** `0.5` or `50%`, both meaning half opaque. */
function readAlpha(token: string | null): number | null {
    if (token === null) {
        return 1;
    }

    const value = token.endsWith("%") ? readScalar(token, 1) : readNumber(token);

    return value === null ? null : clamp(value, 0, 1);
}

type Arguments = {
    readonly channels: readonly string[];
    /** `null` when the value carried no alpha at all. */
    readonly alpha: string | null;
};

/**
 * Splits a function body into channels and an optional alpha, accepting both
 * the modern `r g b / a` form and the legacy `r, g, b, a` one.
 */
function readArguments(body: string, channelCount: number): Arguments | null {
    const parts = body.split("/");

    if (parts.length > 2) {
        return null;
    }

    const tokens = parts[0]
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean);

    if (parts.length === 2) {
        const alpha = parts[1].trim();

        return tokens.length === channelCount && alpha.length > 0
            ? { channels: tokens, alpha }
            : null;
    }

    if (tokens.length === channelCount) {
        return { channels: tokens, alpha: null };
    }

    // The legacy form puts alpha in with the channels: `rgba(0, 0, 0, 0.5)`.
    if (tokens.length === channelCount + 1) {
        return { channels: tokens.slice(0, channelCount), alpha: tokens[channelCount] };
    }

    return null;
}

const FUNCTION = /^([a-z]+)\((.*)\)$/s;

function readFunction(input: string): { readonly name: string; readonly body: string } | null {
    const match = FUNCTION.exec(input);

    return match === null ? null : { name: match[1], body: match[2] };
}

/* ------------------------------------------------------------------ hex --- */

const HEX = /^#?([0-9a-f]{3,8})$/;

function parseHex(input: string): ColorParseResult | null {
    const match = HEX.exec(input);

    if (match === null) {
        return null;
    }

    const digits = match[1];

    if (![3, 4, 6, 8].includes(digits.length)) {
        return null;
    }

    // `#abc` is shorthand for `#aabbcc`, each digit doubled.
    const expanded =
        digits.length <= 4 ? [...digits].map((digit) => digit.repeat(2)).join("") : digits;

    const channel = (index: number) =>
        Number.parseInt(expanded.slice(index * 2, index * 2 + 2), 16);
    const rgb: Rgb = { r: channel(0), g: channel(1), b: channel(2) };
    const alpha = expanded.length === 8 ? channel(3) / 255 : 1;

    return { ok: true, color: { ...rgbToHsv(rgb), a: alpha }, syntax: "hex" };
}

/* ------------------------------------------------------------ functions --- */

function fromRgb(args: Arguments): ColorParseResult | null {
    const channels = args.channels.map((token) =>
        token.endsWith("%") ? readScalar(token, 255) : readNumber(token),
    );
    const alpha = readAlpha(args.alpha);

    if (channels.some((value) => value === null) || alpha === null) {
        return null;
    }

    const [r, g, b] = channels as number[];

    return {
        ok: true,
        color: { ...rgbToHsv(roundRgb({ r, g, b })), a: alpha },
        syntax: "rgb",
    };
}

function fromHsl(args: Arguments): ColorParseResult | null {
    const h = readAngle(args.channels[0]);
    const s = readScalar(args.channels[1], 100);
    const l = readScalar(args.channels[2], 100);
    const alpha = readAlpha(args.alpha);

    if (h === null || s === null || l === null || alpha === null) {
        return null;
    }

    return {
        ok: true,
        color: {
            ...hslToHsv({ h: normalizeHue(h), s: clamp(s, 0, 100), l: clamp(l, 0, 100) }),
            a: alpha,
        },
        syntax: "hsl",
    };
}

function fromHsv(args: Arguments): ColorParseResult | null {
    const h = readAngle(args.channels[0]);
    const s = readScalar(args.channels[1], 100);
    const v = readScalar(args.channels[2], 100);
    const alpha = readAlpha(args.alpha);

    if (h === null || s === null || v === null || alpha === null) {
        return null;
    }

    return {
        ok: true,
        color: {
            h: normalizeHue(h),
            s: clamp(s, 0, 100),
            v: clamp(v, 0, 100),
            a: alpha,
        },
        syntax: "hsv",
    };
}

function fromCmyk(args: Arguments): ColorParseResult | null {
    const channels = args.channels.map((token) => readScalar(token, 100));

    if (channels.some((value) => value === null)) {
        return null;
    }

    const [c, m, y, k] = channels as number[];
    const rgb = cmykToRgb({
        c: clamp(c, 0, 100),
        m: clamp(m, 0, 100),
        y: clamp(y, 0, 100),
        k: clamp(k, 0, 100),
    });

    // CMYK has no alpha channel, so the result is always fully opaque.
    return { ok: true, color: { ...rgbToHsv(rgb), a: 1 }, syntax: "cmyk" };
}

function fromOklch(args: Arguments): ColorParseResult | null {
    // Lightness is a 0–1 fraction, so `0.64` and `64%` mean the same thing.
    const l = readScalar(args.channels[0], 1);
    const c = readNumber(args.channels[1]);
    const h = readAngle(args.channels[2]);
    const alpha = readAlpha(args.alpha);

    if (l === null || c === null || h === null || alpha === null) {
        return null;
    }

    const rgb = oklchToRgb({
        l: clamp(l, 0, 1),
        c: Math.max(0, c),
        h: normalizeHue(h),
    });

    return { ok: true, color: { ...rgbToHsv(rgb), a: alpha }, syntax: "oklch" };
}

const FUNCTIONS: Readonly<
    Record<
        string,
        { readonly channels: number; readonly read: (args: Arguments) => ColorParseResult | null }
    >
> = {
    rgb: { channels: 3, read: fromRgb },
    rgba: { channels: 3, read: fromRgb },
    hsl: { channels: 3, read: fromHsl },
    hsla: { channels: 3, read: fromHsl },
    hsv: { channels: 3, read: fromHsv },
    hsva: { channels: 3, read: fromHsv },
    hsb: { channels: 3, read: fromHsv },
    cmyk: { channels: 4, read: fromCmyk },
    oklch: { channels: 3, read: fromOklch },
};

/* ----------------------------------------------------------- CSS names ---- */

function parseNamed(input: string): ColorParseResult | null {
    // `transparent` is a colour keyword too, and the only one carrying alpha.
    if (input === "transparent") {
        return { ok: true, color: { h: 0, s: 0, v: 0, a: 0 }, syntax: "named" };
    }

    const rgb = CSS_NAMED_COLOR_MAP.get(input);

    if (rgb === undefined) {
        return null;
    }

    return {
        ok: true,
        color: { ...rgbToHsv({ r: rgb[0], g: rgb[1], b: rgb[2] }), a: 1 },
        syntax: "named",
    };
}

/* ---------------------------------------------------------------- entry --- */

/** A bare `196, 104, 149` or `196 104 149`, as design tools tend to print it. */
function parseBareTriple(input: string): ColorParseResult | null {
    const tokens = input.split(/[\s,]+/).filter(Boolean);

    if (tokens.length !== 3) {
        return null;
    }

    return fromRgb({ channels: tokens, alpha: null });
}

export function parseColor(input: string): ColorParseResult {
    const trimmed = input.trim();

    if (trimmed.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (trimmed.length > MAX_COLOR_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    const normalized = trimmed.toLowerCase();

    // A keyword is tried before bare hex so `beef`-shaped names, if CSS ever
    // grows one, keep reading as the keyword they are.
    const named = parseNamed(normalized);

    if (named !== null) {
        return named;
    }

    const parsed = readFunction(normalized);

    if (parsed !== null) {
        const handler = FUNCTIONS[parsed.name];

        if (handler === undefined) {
            return { ok: false, reason: "unrecognised" };
        }

        const args = readArguments(parsed.body, handler.channels);
        const result = args === null ? null : handler.read(args);

        return result ?? { ok: false, reason: "unrecognised" };
    }

    return (
        parseHex(normalized) ?? parseBareTriple(normalized) ?? { ok: false, reason: "unrecognised" }
    );
}

/** Convenience for callers that only need the colour, such as search params. */
export function parseColorOrNull(input: string): Hsva | null {
    const result = parseColor(input);

    return result.ok ? result.color : null;
}
