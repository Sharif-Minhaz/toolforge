import type { Cmyk, Hsl, Hsv, Hsva, Oklch, Rgb } from "../types";

/**
 * Every conversion the tool performs, as pure functions over plain numbers.
 *
 * sRGB is the hub: each model converts to and from it rather than to each
 * other, so there is one implementation per model instead of one per pair.
 */

/* -------------------------------------------------------------- helpers --- */

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Wraps a hue into 0–360, so −30° and 330° describe the same colour. */
export function normalizeHue(hue: number): number {
    const wrapped = hue % 360;

    return wrapped < 0 ? wrapped + 360 : wrapped;
}

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals;

    // `Number.EPSILON` nudges values that land a hair under a .5 boundary in
    // binary floating point, so 1.005 rounds to 1.01 rather than 1.00.
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function roundRgb(rgb: Rgb): Rgb {
    return {
        r: Math.round(clamp(rgb.r, 0, 255)),
        g: Math.round(clamp(rgb.g, 0, 255)),
        b: Math.round(clamp(rgb.b, 0, 255)),
    };
}

/* ------------------------------------------------------------ RGB ↔ HSV --- */

export function rgbToHsv(rgb: Rgb): Hsv {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    const hue =
        delta === 0
            ? 0
            : max === r
              ? 60 * (((g - b) / delta) % 6)
              : max === g
                ? 60 * ((b - r) / delta + 2)
                : 60 * ((r - g) / delta + 4);

    return {
        h: normalizeHue(hue),
        s: max === 0 ? 0 : (delta / max) * 100,
        v: max * 100,
    };
}

export function hsvToRgb(hsv: Hsv): Rgb {
    const h = normalizeHue(hsv.h) / 60;
    const s = clamp(hsv.s, 0, 100) / 100;
    const v = clamp(hsv.v, 0, 100) / 100;

    const chroma = v * s;
    const second = chroma * (1 - Math.abs((h % 2) - 1));
    const match = v - chroma;

    const sector = Math.floor(h) % 6;
    const [r, g, b] = (
        [
            [chroma, second, 0],
            [second, chroma, 0],
            [0, chroma, second],
            [0, second, chroma],
            [second, 0, chroma],
            [chroma, 0, second],
        ] as const
    )[sector];

    return roundRgb({ r: (r + match) * 255, g: (g + match) * 255, b: (b + match) * 255 });
}

/* ------------------------------------------------------------ HSV ↔ HSL --- */

export function hsvToHsl(hsv: Hsv): Hsl {
    const s = clamp(hsv.s, 0, 100) / 100;
    const v = clamp(hsv.v, 0, 100) / 100;

    const l = v * (1 - s / 2);
    // Both ends of the lightness axis are pure black and pure white, where no
    // amount of saturation changes anything.
    const saturation = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);

    return { h: normalizeHue(hsv.h), s: saturation * 100, l: l * 100 };
}

export function hslToHsv(hsl: Hsl): Hsv {
    const s = clamp(hsl.s, 0, 100) / 100;
    const l = clamp(hsl.l, 0, 100) / 100;

    const v = l + s * Math.min(l, 1 - l);

    return { h: normalizeHue(hsl.h), s: v === 0 ? 0 : 2 * (1 - l / v) * 100, v: v * 100 };
}

/* ------------------------------------------------------------ RGB ↔ HSL --- */

export function rgbToHsl(rgb: Rgb): Hsl {
    return hsvToHsl(rgbToHsv(rgb));
}

export function hslToRgb(hsl: Hsl): Rgb {
    return hsvToRgb(hslToHsv(hsl));
}

/* ----------------------------------------------------------- RGB ↔ CMYK --- */

/**
 * The naive device-independent transform every design tool shows. It is not a
 * colour-managed separation — a real print profile needs an ICC one — but it is
 * what "the CMYK of this hex" universally means.
 */
export function rgbToCmyk(rgb: Rgb): Cmyk {
    const r = clamp(rgb.r, 0, 255) / 255;
    const g = clamp(rgb.g, 0, 255) / 255;
    const b = clamp(rgb.b, 0, 255) / 255;

    const k = 1 - Math.max(r, g, b);

    // Pure black carries no colourant, so the other three channels stay at 0
    // instead of dividing by zero.
    if (k === 1) {
        return { c: 0, m: 0, y: 0, k: 100 };
    }

    return {
        c: ((1 - r - k) / (1 - k)) * 100,
        m: ((1 - g - k) / (1 - k)) * 100,
        y: ((1 - b - k) / (1 - k)) * 100,
        k: k * 100,
    };
}

export function cmykToRgb(cmyk: Cmyk): Rgb {
    const c = clamp(cmyk.c, 0, 100) / 100;
    const m = clamp(cmyk.m, 0, 100) / 100;
    const y = clamp(cmyk.y, 0, 100) / 100;
    const k = clamp(cmyk.k, 0, 100) / 100;

    return roundRgb({
        r: 255 * (1 - c) * (1 - k),
        g: 255 * (1 - m) * (1 - k),
        b: 255 * (1 - y) * (1 - k),
    });
}

/* ---------------------------------------------------------- RGB ↔ OKLCH --- */

/**
 * Matrices and transfer functions from CSS Color Module 4. They are transcribed
 * from the reference implementation shipped inside `axe-core` (colorjs.io)
 * rather than typed from memory; `tests/convert.test.ts` pins the three sRGB
 * primaries against the values the specification publishes.
 */
type Matrix3 = readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
];

type Vector3 = readonly [number, number, number];

const LINEAR_RGB_TO_XYZ: Matrix3 = [
    [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
    [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
    [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
];

const XYZ_TO_LINEAR_RGB: Matrix3 = [
    [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
    [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
    [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

const XYZ_TO_LMS: Matrix3 = [
    [0.8190224432164319, 0.3619062562801221, -0.12887378261216414],
    [0.0329836671980271, 0.9292868468965546, 0.03614466816999844],
    [0.048177199566046255, 0.26423952494422764, 0.6335478258136937],
];

const LMS_TO_XYZ: Matrix3 = [
    [1.2268798733741557, -0.5578149965554813, 0.28139105017721583],
    [-0.04057576262431372, 1.1122868293970594, -0.07171106666151701],
    [-0.07637294974672142, -0.4214933239627914, 1.5869240244272418],
];

const LMS_TO_OKLAB: Matrix3 = [
    [0.2104542553, 0.793617785, -0.0040720468],
    [1.9779984951, -2.428592205, 0.4505937099],
    [0.0259040371, 0.7827717662, -0.808675766],
];

const OKLAB_TO_LMS: Matrix3 = [
    [0.9999999984505198, 0.39633779217376786, 0.2158037580607588],
    [1.0000000088817609, -0.10556134232365635, -0.06385417477170591],
    [1.0000000546724108, -0.08948418209496575, -1.2914855378640917],
];

function multiply(matrix: Matrix3, vector: Vector3): Vector3 {
    return [
        matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
        matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
        matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
    ];
}

/** The sRGB electro-optical transfer function, applied sign-preserving. */
function srgbToLinear(channel: number): number {
    const sign = channel < 0 ? -1 : 1;
    const magnitude = Math.abs(channel);

    return magnitude <= 0.04045 ? channel / 12.92 : sign * ((magnitude + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
    const sign = channel < 0 ? -1 : 1;
    const magnitude = Math.abs(channel);

    return magnitude <= 0.0031308
        ? channel * 12.92
        : sign * (1.055 * magnitude ** (1 / 2.4) - 0.055);
}

/** OKLab coordinates, the space distances are measured in. */
export type Oklab = {
    readonly l: number;
    readonly a: number;
    readonly b: number;
};

export function rgbToOklab(rgb: Rgb): Oklab {
    const linear: Vector3 = [
        srgbToLinear(clamp(rgb.r, 0, 255) / 255),
        srgbToLinear(clamp(rgb.g, 0, 255) / 255),
        srgbToLinear(clamp(rgb.b, 0, 255) / 255),
    ];

    const lms = multiply(XYZ_TO_LMS, multiply(LINEAR_RGB_TO_XYZ, linear));
    const [l, a, b] = multiply(LMS_TO_OKLAB, [
        Math.cbrt(lms[0]),
        Math.cbrt(lms[1]),
        Math.cbrt(lms[2]),
    ]);

    return { l, a, b };
}

/** Linear-light sRGB, before clipping — so the caller can see out-of-gamut. */
function oklabToLinearRgb(oklab: Oklab): Vector3 {
    const lms = multiply(OKLAB_TO_LMS, [oklab.l, oklab.a, oklab.b]);
    const xyz = multiply(LMS_TO_XYZ, [lms[0] ** 3, lms[1] ** 3, lms[2] ** 3]);

    return multiply(XYZ_TO_LINEAR_RGB, xyz);
}

export function oklabToRgb(oklab: Oklab): Rgb {
    const [r, g, b] = oklabToLinearRgb(oklab);

    return roundRgb({
        r: linearToSrgb(r) * 255,
        g: linearToSrgb(g) * 255,
        b: linearToSrgb(b) * 255,
    });
}

export function oklabToOklch(oklab: Oklab): Oklch {
    const chroma = Math.hypot(oklab.a, oklab.b);

    return {
        l: oklab.l,
        c: chroma,
        // With no chroma there is no hue to report; 0 keeps the value finite.
        h: chroma < 1e-6 ? 0 : normalizeHue((Math.atan2(oklab.b, oklab.a) * 180) / Math.PI),
    };
}

export function oklchToOklab(oklch: Oklch): Oklab {
    const radians = (normalizeHue(oklch.h) * Math.PI) / 180;

    return {
        l: oklch.l,
        a: oklch.c * Math.cos(radians),
        b: oklch.c * Math.sin(radians),
    };
}

export function rgbToOklch(rgb: Rgb): Oklch {
    return oklabToOklch(rgbToOklab(rgb));
}

export function oklchToRgb(oklch: Oklch): Rgb {
    return oklabToRgb(oklchToOklab(oklch));
}

/** A colour is in gamut when every linear channel lands inside [0, 1]. */
export function isInSrgbGamut(oklch: Oklch): boolean {
    const linear = oklabToLinearRgb(oklchToOklab(oklch));
    const tolerance = 1e-5;

    return linear.every((channel) => channel >= -tolerance && channel <= 1 + tolerance);
}

/**
 * Walks chroma down until the colour fits inside sRGB, keeping lightness and
 * hue. Clipping the RGB channels instead would shift the hue, which is exactly
 * what makes a generated scale look wrong at its saturated end.
 */
export function clampChromaToGamut(oklch: Oklch): Oklch {
    if (isInSrgbGamut(oklch)) {
        return oklch;
    }

    let low = 0;
    let high = oklch.c;

    // 20 halvings resolves chroma to under one part in a million, far below
    // what an 8-bit channel can show.
    for (let step = 0; step < 20; step += 1) {
        const middle = (low + high) / 2;

        if (isInSrgbGamut({ ...oklch, c: middle })) {
            low = middle;
        } else {
            high = middle;
        }
    }

    return { ...oklch, c: low };
}

/* ------------------------------------------------------------- rounding --- */

/** Whole degrees and percents, which is how CSS colour values are written. */
export function roundHsl(hsl: Hsl): Hsl {
    return { h: Math.round(hsl.h) % 360, s: Math.round(hsl.s), l: Math.round(hsl.l) };
}

export function roundHsv(hsv: Hsv): Hsv {
    return { h: Math.round(hsv.h) % 360, s: Math.round(hsv.s), v: Math.round(hsv.v) };
}

export function roundCmyk(cmyk: Cmyk): Cmyk {
    return {
        c: Math.round(cmyk.c),
        m: Math.round(cmyk.m),
        y: Math.round(cmyk.y),
        k: Math.round(cmyk.k),
    };
}

/** Matches how Tailwind writes its own palette: `oklch(63.7% 0.237 25.331)`. */
export function roundOklch(oklch: Oklch): Oklch {
    return {
        l: round(oklch.l * 100, 1),
        c: round(oklch.c, 3),
        h: round(normalizeHue(oklch.h), 3),
    };
}

/* ---------------------------------------------------------------- HSVA ---- */

export function hsvaToRgb(hsva: Hsva): Rgb {
    return hsvToRgb(hsva);
}

export function rgbToHsva(rgb: Rgb, alpha = 1): Hsva {
    return { ...rgbToHsv(rgb), a: clamp(alpha, 0, 1) };
}
