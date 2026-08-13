/**
 * Comparison whose running time does not depend on where two strings diverge.
 *
 * `===` on a string returns as soon as it finds a difference, so the time it
 * takes leaks how much of a secret a guess got right. That is a real attack on
 * anything compared against a token or a digest, and it is cheap to close.
 *
 * Lifted out of the Hash tool when the MCP endpoint needed the same comparison
 * for its bearer token. It was never about hashes.
 *
 * Length is compared up front on purpose: for a fixed-width digest it is public
 * information, and hiding it would mean hashing both sides first.
 */
export function timingSafeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }

    let difference = 0;

    for (let index = 0; index < left.length; index += 1) {
        difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }

    return difference === 0;
}
