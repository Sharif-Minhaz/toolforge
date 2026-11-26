/** `0o7777`: four octal digits, twelve bits. Nothing above it is a mode. */
export const MAX_MODE = 0o7777;

/** Where the page opens: the mode `chmod +x` usually ends up at. */
export const DEFAULT_MODE = 0o755;

/**
 * Ceiling on the octal and symbolic fields, the `?mode=` value and the MCP
 * argument. The longest thing either field reads is `drwxr-xr-x.` at eleven;
 * past sixteen it is not a mode somebody mistyped.
 */
export const MAX_MODE_INPUT_LENGTH = 16;

/** Ceiling on the path the command is written for. `PATH_MAX` is 4096; nobody types that. */
export const MAX_PATH_LENGTH = 1024;

/** What the command names when the path field is left empty. */
export const DEFAULT_PATH = "file";
