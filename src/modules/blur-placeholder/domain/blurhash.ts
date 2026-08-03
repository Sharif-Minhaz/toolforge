import { decodeBase83, encodeBase83, findInvalidBase83Index } from "./base83";
import { MAX_COMPONENTS, MIN_COMPONENTS } from "./constants";
import type {
    DecodeBlurhashResult,
    EncodeBlurhashResult,
    ParseBlurhashResult,
    RgbaImage,
} from "../types";

/**
 * BlurHash, both directions, in plain arithmetic.
 *
 * The transform is a truncated cosine basis — the same one JPEG uses — kept to
 * at most 9 × 9 coefficients and quantised hard enough that the whole thing
 * fits in a string you can put in a database column. Because other people's
 * decoders read what this writes (react-blurhash in a browser, the Kotlin and
 * Swift ports on a phone), every constant below is the specification's and not
 * a taste: `tests/blurhash-reference.test.ts` checks the output against the
 * reference implementation rather than against assertions written here.
 *
 * Nothing in this file touches a canvas, so all of it runs under `bun test`.
 */

/** Where the average colour ends and the first coefficient begins. */
const DC_END = 6;

/** Two base83 characters per AC coefficient. */
const AC_WIDTH = 2;

/** The quantiser's ceiling: 19 levels per channel, packed into 19³ < 83². */
const AC_LEVELS = 19;

/** sRGB byte to linear light. Averaging in sRGB darkens a blur; this is why. */
function srgbToLinear(value: number): number {
    const channel = value / 255;

    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * `trunc(x + 0.5)` and not `round(x)`, even though the two agree everywhere
 * that matters: the reference implementation is written this way, and this
 * function decides a byte. Rounding half a step differently here is the whole
 * difference between a hash that matches every other generator and one that is
 * almost right.
 */
function linearToSrgb(value: number): number {
    const channel = Math.max(0, Math.min(1, value));

    return channel <= 0.0031308
        ? Math.trunc(channel * 12.92 * 255 + 0.5)
        : Math.trunc((1.055 * channel ** (1 / 2.4) - 0.055) * 255 + 0.5);
}

/** Raising a negative number to a fractional power, without producing `NaN`. */
function signPow(value: number, exponent: number): number {
    return Math.sign(value) * Math.abs(value) ** exponent;
}

function isComponentCount(value: number): boolean {
    return Number.isInteger(value) && value >= MIN_COMPONENTS && value <= MAX_COMPONENTS;
}

/* ------------------------------------------------------------- encoding --- */

/**
 * Every pixel converted to linear light once, up front.
 *
 * The naive shape converts inside each basis pass, which repeats the same
 * `pow` up to 81 times per pixel for a result that cannot have changed.
 */
function toLinearChannels(image: RgbaImage): Float64Array {
    const { data, width, height } = image;
    const linear = new Float64Array(width * height * 3);

    for (let pixel = 0; pixel < width * height; pixel += 1) {
        linear[pixel * 3] = srgbToLinear(data[pixel * 4]);
        linear[pixel * 3 + 1] = srgbToLinear(data[pixel * 4 + 1]);
        linear[pixel * 3 + 2] = srgbToLinear(data[pixel * 4 + 2]);
    }

    return linear;
}

/**
 * Columns outside, rows inside — the order the reference implementation walks
 * the picture in.
 *
 * It is the wrong way round for a cache and the right way round for the
 * arithmetic: floating-point addition is not associative, so summing a million
 * terms in a different sequence lands a hair away and rounds a byte the other
 * side of a boundary. Matching the order is what makes the cross-check exact
 * rather than approximate.
 */
function multiplyBasisFunction(
    linear: Float64Array,
    width: number,
    height: number,
    componentX: number,
    componentY: number,
): [number, number, number] {
    // Every coefficient but the first counts twice, because the cosine basis is
    // only half of the symmetric transform it stands in for.
    const normalisation = componentX === 0 && componentY === 0 ? 1 : 2;

    let red = 0;
    let green = 0;
    let blue = 0;

    for (let x = 0; x < width; x += 1) {
        const columnBasis = normalisation * Math.cos((Math.PI * componentX * x) / width);

        for (let y = 0; y < height; y += 1) {
            const basis = columnBasis * Math.cos((Math.PI * componentY * y) / height);
            const index = (y * width + x) * 3;

            red += basis * linear[index];
            green += basis * linear[index + 1];
            blue += basis * linear[index + 2];
        }
    }

    const scale = 1 / (width * height);

    return [red * scale, green * scale, blue * scale];
}

function encodeDc([red, green, blue]: readonly number[]): number {
    return (linearToSrgb(red) << 16) + (linearToSrgb(green) << 8) + linearToSrgb(blue);
}

function encodeAc([red, green, blue]: readonly number[], maximumValue: number): number {
    const quantise = (value: number) =>
        Math.floor(
            Math.max(0, Math.min(18, Math.floor(signPow(value / maximumValue, 0.5) * 9 + 9.5))),
        );

    return quantise(red) * AC_LEVELS * AC_LEVELS + quantise(green) * AC_LEVELS + quantise(blue);
}

/**
 * Turns pixels into a hash.
 *
 * `componentX` and `componentY` are how many cosine terms survive in each
 * direction — more detail, two more characters each. The picture's own size
 * does not appear in the output at all, which is why the same photograph at
 * 4000 px and at 128 px produces very nearly the same string.
 */
export function encodeBlurhash(
    image: RgbaImage,
    componentX: number,
    componentY: number,
): EncodeBlurhashResult {
    if (!isComponentCount(componentX) || !isComponentCount(componentY)) {
        return { ok: false, reason: "invalid_components" };
    }

    const { width, height, data } = image;

    if (width <= 0 || height <= 0 || data.length !== width * height * 4) {
        return { ok: false, reason: "invalid_image" };
    }

    const linear = toLinearChannels(image);
    const factors: [number, number, number][] = [];

    for (let y = 0; y < componentY; y += 1) {
        for (let x = 0; x < componentX; x += 1) {
            factors.push(multiplyBasisFunction(linear, width, height, x, y));
        }
    }

    const [dc, ...ac] = factors;

    let hash = encodeBase83(componentX - 1 + (componentY - 1) * MAX_COMPONENTS, 1);
    let maximumValue = 1;

    if (ac.length > 0) {
        // The signed maximum, not the largest magnitude. The C reference takes
        // the absolute value here and the JavaScript one does not, and this
        // follows JavaScript: it is what `blurhash` on npm and therefore what
        // blurha.sh produce, so a hash from this tool is the same string as a
        // hash from theirs. Either choice decodes correctly everywhere — the
        // scale it picks is written into the hash — and on a blur this size the
        // difference is a fraction of a quantiser step.
        const actualMaximum = Math.max(...ac.map((factor) => Math.max(...factor)));
        // 82 is the largest single base83 digit, so the scale itself costs one
        // character and every coefficient is then expressed relative to it.
        const quantisedMaximum = Math.max(0, Math.min(82, Math.floor(actualMaximum * 166 - 0.5)));

        maximumValue = (quantisedMaximum + 1) / 166;
        hash += encodeBase83(quantisedMaximum, 1);
    } else {
        hash += encodeBase83(0, 1);
    }

    hash += encodeBase83(encodeDc(dc), 4);

    for (const factor of ac) {
        hash += encodeBase83(encodeAc(factor, maximumValue), AC_WIDTH);
    }

    return { ok: true, hash };
}

/* ------------------------------------------------------------- decoding --- */

/**
 * Reads the size flag and checks the length against it.
 *
 * Order matters: an unknown character is reported before a length complaint,
 * because a hash pasted with a stray quote around it is a different mistake
 * from a hash that was truncated, and the reader fixes each one differently.
 */
export function parseBlurhash(hash: string): ParseBlurhashResult {
    if (hash.length === 0) {
        return { ok: false, reason: "empty_hash" };
    }

    const invalid = findInvalidBase83Index(hash);

    if (invalid !== -1) {
        return { ok: false, reason: "invalid_character", position: invalid + 1 };
    }

    if (hash.length < DC_END) {
        return { ok: false, reason: "too_short" };
    }

    // Validated above, so the alphabet lookup cannot miss.
    const sizeFlag = decodeBase83(hash[0]) ?? 0;
    const componentX = (sizeFlag % MAX_COMPONENTS) + 1;
    const componentY = Math.floor(sizeFlag / MAX_COMPONENTS) + 1;
    const expectedLength = 4 + AC_WIDTH * componentX * componentY;

    if (hash.length !== expectedLength) {
        return { ok: false, reason: "length_mismatch", expectedLength };
    }

    return { ok: true, componentX, componentY, length: hash.length };
}

/** `cos(π · component · sample / extent)` for every pair, laid out row-major. */
function cosineTable(extent: number, components: number): Float64Array {
    const table = new Float64Array(extent * components);

    for (let component = 0; component < components; component += 1) {
        for (let sample = 0; sample < extent; sample += 1) {
            table[component * extent + sample] = Math.cos((Math.PI * sample * component) / extent);
        }
    }

    return table;
}

function decodeDc(value: number): [number, number, number] {
    return [srgbToLinear(value >> 16), srgbToLinear((value >> 8) & 255), srgbToLinear(value & 255)];
}

function decodeAc(value: number, maximumValue: number): [number, number, number] {
    const quantised = [
        Math.floor(value / (AC_LEVELS * AC_LEVELS)),
        Math.floor(value / AC_LEVELS) % AC_LEVELS,
        value % AC_LEVELS,
    ];

    return quantised.map((level) => signPow((level - 9) / 9, 2) * maximumValue) as [
        number,
        number,
        number,
    ];
}

/**
 * Paints a hash back into RGBA pixels at whatever size is asked for.
 *
 * The size is a free choice because the hash holds no size — it is a continuous
 * function sampled on a grid, so 16 × 16 and 1600 × 1600 are the same picture
 * at different resolutions. `punch` scales every coefficient but the average,
 * which pulls the colours apart without moving them.
 */
export function decodeBlurhash(
    hash: string,
    width: number,
    height: number,
    punch = 1,
): DecodeBlurhashResult {
    const parsed = parseBlurhash(hash);

    if (!parsed.ok) {
        return parsed;
    }

    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        return { ok: false, reason: "invalid_size" };
    }

    const { componentX, componentY } = parsed;
    const maximumValue = ((decodeBase83(hash[1]) ?? 0) + 1) / 166;
    const colors: [number, number, number][] = [decodeDc(decodeBase83(hash.slice(2, DC_END)) ?? 0)];

    for (let index = 1; index < componentX * componentY; index += 1) {
        const start = DC_END + (index - 1) * AC_WIDTH;

        colors.push(
            decodeAc(decodeBase83(hash.slice(start, start + AC_WIDTH)) ?? 0, maximumValue * punch),
        );
    }

    const pixels = new Uint8ClampedArray(width * height * 4);
    // Each cosine is one of `width × componentX` distinct values, and the naive
    // loop recomputes every one of them once per pixel — 6.8 million calls to
    // `Math.cos` for a 400-pixel preview at 9 × 9. Tabulating them is what makes
    // painting at display size affordable, and it changes nothing: the same
    // double comes out of the table as out of the call, multiplied in the same
    // order, so the cross-check against the reference stays exact.
    const cosX = cosineTable(width, componentX);
    const cosY = cosineTable(height, componentY);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let red = 0;
            let green = 0;
            let blue = 0;

            for (let j = 0; j < componentY; j += 1) {
                const rowBasis = cosY[j * height + y];

                for (let i = 0; i < componentX; i += 1) {
                    const basis = cosX[i * width + x] * rowBasis;
                    const color = colors[i + j * componentX];

                    red += color[0] * basis;
                    green += color[1] * basis;
                    blue += color[2] * basis;
                }
            }

            const index = (y * width + x) * 4;

            pixels[index] = linearToSrgb(red);
            pixels[index + 1] = linearToSrgb(green);
            pixels[index + 2] = linearToSrgb(blue);
            // A placeholder is opaque by definition: it stands in for a picture
            // that has not arrived, and a translucent one would show the layout
            // shifting underneath it.
            pixels[index + 3] = 255;
        }
    }

    return { ok: true, pixels, width, height };
}

/** The hash's own average colour, for a one-line CSS fallback. */
export function averageColorHex(hash: string): string | null {
    const parsed = parseBlurhash(hash);

    if (!parsed.ok) {
        return null;
    }

    const value = decodeBase83(hash.slice(2, DC_END)) ?? 0;

    return `#${value.toString(16).padStart(6, "0")}`;
}
