/**
 * The three audiences a Unix mode speaks to, in the order `ls -l` prints them.
 * Literal unions so `classes.<id>` and `permissions.<id>` stay checkable.
 */
export const PERMISSION_CLASSES = ["owner", "group", "others"] as const;

export type PermissionClass = (typeof PERMISSION_CLASSES)[number];

export const PERMISSIONS = ["read", "write", "execute"] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** The fourth octal digit, highest bit first: 4, 2, 1. */
export const SPECIAL_BITS = ["setuid", "setgid", "sticky"] as const;

export type SpecialBit = (typeof SPECIAL_BITS)[number];

/** The modes the preset row offers, written the way people say them. */
export const CHMOD_PRESETS = ["644", "755", "600", "700", "775", "777"] as const;

export type ChmodPreset = (typeof CHMOD_PRESETS)[number];

/** The rows of the result, each copyable. Keys of `ChmodDescription`. */
export const CHMOD_OUTPUTS = ["octal", "symbolic", "assignment", "command"] as const;

export type ChmodOutput = (typeof CHMOD_OUTPUTS)[number];

export type ModeParseFailureReason =
    /** Nothing typed. */
    | "empty"
    /** A character that cannot sit where it was typed. */
    | "invalid_character"
    /** More than four significant octal digits — past `7777`. */
    | "out_of_range"
    /** A permission string that is not nine characters once its extras are gone. */
    | "invalid_length";

export type ModeParseFailure = {
    readonly ok: false;
    readonly reason: ModeParseFailureReason;
    /** 1-based, in characters of the trimmed input. Set on `invalid_character`. */
    readonly position?: number;
    /**
     * What the symbolic slot at `position` accepts, e.g. `["x", "-", "s", "S"]`.
     * Literal characters, so the UI prints them as data rather than copy.
     */
    readonly expected?: readonly string[];
};

export type ModeParseResult = { readonly ok: true; readonly mode: number } | ModeParseFailure;

/** Every way the tool writes one mode down. */
export type ChmodDescription = {
    readonly mode: number;
    /** `755`, or `4755` once a special bit is set. */
    readonly octal: string;
    /** `rwxr-xr-x`, as the last nine characters of `ls -l`. */
    readonly symbolic: string;
    /** `u=rwx,g=rx,o=rx`, which GNU `chmod` applies to exactly this mode. */
    readonly assignment: string;
    /** `chmod 755 file`. */
    readonly command: string;
    /** Others may write — every account on the machine can change it. */
    readonly worldWritable: boolean;
};
