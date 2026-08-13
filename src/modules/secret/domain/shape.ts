import { MAX_VARIABLE_NAME_LENGTH, VARIABLE_NAME_PATTERN } from "./constants";
import type { SecretShape } from "../types";

/**
 * Whether the variable-name field means anything for this shape. The `bare`
 * shape is the secret and nothing else, so the field is disabled rather than
 * quietly collected and dropped.
 */
export function supportsVariableName(shape: SecretShape): boolean {
    return shape !== "bare";
}

export function isValidVariableName(name: string): boolean {
    return name.length <= MAX_VARIABLE_NAME_LENGTH && VARIABLE_NAME_PATTERN.test(name);
}

/**
 * What a person types on the way to a variable name, reduced to what a shell
 * will accept.
 *
 * Applied per keystroke in the field rather than on submit: a name is a short
 * identity value, so the character that cannot be there is refused as it
 * arrives. Lower case survives — `auth_secret` is unconventional but legal, and
 * silently upper-casing somebody's typing is the kind of help that reads as a
 * bug.
 */
export function sanitizeVariableName(input: string): string {
    return input.replace(/[^A-Za-z0-9_]/g, "").slice(0, MAX_VARIABLE_NAME_LENGTH);
}

/**
 * The secret laid out for wherever it is going.
 *
 * `env` is deliberately unquoted: dotenv readers treat quotes as part of the
 * value about as often as they strip them, and every alphabet this tool emits
 * is already free of the characters that would need quoting. `export` is
 * double-quoted because that line is read by a shell, where an unquoted value
 * is at the mercy of whatever the encoding happened to draw.
 */
export function formatSecret(secret: string, shape: SecretShape, variableName: string): string {
    switch (shape) {
        case "bare":
            return secret;
        case "env":
            return `${variableName}=${secret}`;
        case "export":
            return `export ${variableName}="${secret}"`;
    }
}
