/**
 * Bangla digits, read and written. Shared by every tool that takes a number a
 * Bangla keyboard typed: `১২৫০` is twelve hundred and fifty, not four letters.
 */

export const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

/** One character as the Western digit it stands for, or `null` if it is not a digit. */
export function westernDigit(char: string): string | null {
    if (char >= "0" && char <= "9") {
        return char;
    }

    const bangla = BANGLA_DIGITS.indexOf(char);

    return bangla === -1 ? null : String(bangla);
}

/** Every Western digit in `text` rewritten as its Bangla digit; everything else kept. */
export function toBanglaDigits(text: string): string {
    return text.replace(/\d/g, (digit) => BANGLA_DIGITS[Number(digit)]);
}
