/**
 * Reed–Solomon over GF(256), the error correction a QR symbol carries.
 *
 * The field is the one ISO/IEC 18004 fixes: byte values modulo the primitive
 * polynomial x⁸ + x⁴ + x³ + x² + 1. Everything here is byte arithmetic with no
 * lookup tables — the arrays are small enough that the loop is not the cost, and
 * a table would have to be built and kept correct for no measurable gain.
 */

const PRIMITIVE_POLYNOMIAL = 0x11d;

/**
 * Carry-less multiply, reducing modulo the primitive polynomial as it goes, so
 * the running value never leaves a single byte.
 */
export function multiply(a: number, b: number): number {
    let product = 0;

    for (let bit = 7; bit >= 0; bit -= 1) {
        product = (product << 1) ^ ((product >>> 7) * PRIMITIVE_POLYNOMIAL);
        product ^= ((b >>> bit) & 1) * a;
    }

    return product & 0xff;
}

/**
 * Coefficients of the generator polynomial of the given degree — the product of
 * (x − 2ⁱ) for i below the degree — with the leading 1 left implicit, highest
 * power first.
 */
export function computeDivisor(degree: number): Uint8Array {
    const divisor = new Uint8Array(degree);
    divisor[degree - 1] = 1;

    let root = 1;

    for (let step = 0; step < degree; step += 1) {
        for (let index = 0; index < degree; index += 1) {
            divisor[index] = multiply(divisor[index], root);

            if (index + 1 < degree) {
                divisor[index] ^= divisor[index + 1];
            }
        }

        root = multiply(root, 0x02);
    }

    return divisor;
}

/**
 * The remainder of the data polynomial divided by the generator — the error
 * correction codewords appended to one block.
 */
export function computeRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
    const remainder = new Uint8Array(divisor.length);

    for (const byte of data) {
        const factor = byte ^ remainder[0];

        remainder.copyWithin(0, 1);
        remainder[remainder.length - 1] = 0;

        for (let index = 0; index < remainder.length; index += 1) {
            remainder[index] ^= multiply(divisor[index], factor);
        }
    }

    return remainder;
}
