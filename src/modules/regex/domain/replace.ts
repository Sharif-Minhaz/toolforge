import type { RegexMatch } from "../types";

/**
 * Replacement-token expansion, following `String.prototype.replace` exactly.
 *
 * Exactly matters: the point of the substitution pane is to show what that
 * call would produce, so inventing a friendlier token — regex101 writes the
 * whole match as `$0`, where JavaScript reads that literally — would make the
 * preview a lie. The pane names the real tokens instead.
 */

/** Used by List mode, and whenever a substitution is left blank. */
export const WHOLE_MATCH_TOKEN = "$&";

function captureValue(match: RegexMatch, index: number): string {
    return match.captures[index - 1]?.value ?? "";
}

export function expandReplacement(replacement: string, match: RegexMatch, input: string): string {
    const captureCount = match.captures.length;
    const hasNamedGroups = match.captures.some((capture) => capture.name !== null);

    let output = "";
    let index = 0;

    while (index < replacement.length) {
        const character = replacement[index];

        if (character !== "$") {
            output += character;
            index += 1;
            continue;
        }

        const next = replacement[index + 1];

        if (next === undefined || next === "$") {
            output += "$";
            index += next === undefined ? 1 : 2;
            continue;
        }

        if (next === "&") {
            output += match.value;
            index += 2;
            continue;
        }

        if (next === "`") {
            output += input.slice(0, match.start);
            index += 2;
            continue;
        }

        if (next === "'") {
            output += input.slice(match.end);
            index += 2;
            continue;
        }

        // `$<name>` is only a token when the pattern actually declares named
        // groups; otherwise it is four ordinary characters.
        if (next === "<" && hasNamedGroups) {
            const close = replacement.indexOf(">", index + 2);

            if (close !== -1) {
                const name = replacement.slice(index + 2, close);

                output += match.captures.find((capture) => capture.name === name)?.value ?? "";
                index = close + 1;
                continue;
            }
        }

        if (next >= "0" && next <= "9") {
            const twoDigits = replacement.slice(index + 1, index + 3);
            const twoDigitIndex = /^\d\d$/.test(twoDigits) ? Number(twoDigits) : 0;

            // `$12` is group 12 when there is one, and group 1 followed by a
            // literal 2 when there is not.
            if (twoDigitIndex >= 1 && twoDigitIndex <= captureCount) {
                output += captureValue(match, twoDigitIndex);
                index += 3;
                continue;
            }

            const oneDigitIndex = Number(next);

            if (oneDigitIndex >= 1 && oneDigitIndex <= captureCount) {
                output += captureValue(match, oneDigitIndex);
                index += 2;
                continue;
            }
        }

        // `$` in front of anything else — including `$0` — stands for itself.
        output += "$";
        index += 1;
    }

    return output;
}

/** Rebuilds the whole input with every match replaced. */
export function substituteAll(
    input: string,
    matches: readonly RegexMatch[],
    replacement: string,
): string {
    let output = "";
    let cursor = 0;

    for (const match of matches) {
        // Overlapping matches cannot happen, but a truncated list can leave the
        // cursor ahead of a later match if one is ever passed out of order.
        if (match.start < cursor) {
            continue;
        }

        output += input.slice(cursor, match.start);
        output += expandReplacement(replacement, match, input);
        cursor = match.end;
    }

    return output + input.slice(cursor);
}

/** One line per match, each expanded through the same replacement tokens. */
export function listMatches(
    input: string,
    matches: readonly RegexMatch[],
    replacement: string,
): string {
    const template = replacement.length === 0 ? WHOLE_MATCH_TOKEN : replacement;

    return matches.map((match) => expandReplacement(template, match, input)).join("\n");
}
