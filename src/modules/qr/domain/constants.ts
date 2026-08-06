import type { QrDraft, QrErrorLevel, QrOptions, QrPayloadKind } from "../types";

/**
 * Version 40 at level L holds 2,953 bytes, and nothing useful gets near that.
 * The cap is on characters rather than bytes so the counter under the field
 * matches what the reader typed; the encoder still reports `too_long` if a
 * payload of multi-byte characters overflows the largest symbol.
 */
export const MAX_PAYLOAD_LENGTH = 1_200;

/** Per-field caps, so one runaway vCard line cannot swallow the whole budget. */
export const MAX_FIELD_LENGTH = 400;

/** Enough for a network name and a passphrase, neither of which is prose. */
export const MAX_WIFI_FIELD_LENGTH = 128;

export const DEFAULT_PAYLOAD_KIND: QrPayloadKind = "url";

export const DEFAULT_ERROR_LEVEL: QrErrorLevel = "M";

/**
 * A logo covers modules the scanner then has to reconstruct, so the highest
 * level is not a suggestion — it is what makes the code readable at all.
 */
export const LOGO_ERROR_LEVEL: QrErrorLevel = "H";

/** Fraction of the code's width the logo may occupy. */
export const LOGO_SCALE_RANGE = { min: 0.12, max: 0.28, step: 0.02 } as const;

export const DEFAULT_LOGO_SCALE = 0.2;

/** Quiet zone in modules. Four is the specification's minimum; two still scans. */
export const MARGIN_RANGE = { min: 0, max: 8 } as const;

export const DEFAULT_MARGIN = 4;

/** Exported PNG side in pixels. The SVG is resolution-free either way. */
export const PIXEL_SIZE_RANGE = { min: 256, max: 2_048 } as const;

export const DEFAULT_PIXEL_SIZE = 1_024;

export const PIXEL_SIZE_PRESETS = [256, 512, 1_024, 2_048] as const;

/** `#rrggbb`. What the hex field caps at — `hexColorSchema` accepts no other spelling. */
export const HEX_COLOR_LENGTH = 7;

export const DEFAULT_FOREGROUND = "#000000";

export const DEFAULT_BACKGROUND = "#ffffff";

/** The one value `background` takes that is not a colour. */
export const TRANSPARENT_BACKGROUND = "transparent";

export const LOGO_FILE_LIMITS = {
    allowedTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 512 * 1_024,
} as const;

/**
 * `accept` for the logo picker — a hint to the file dialog, never a substitute
 * for the check. SVG is deliberately absent: it would be inlined into an
 * `<image>` element, and an SVG can carry script.
 */
export const LOGO_ACCEPT_ATTRIBUTE = LOGO_FILE_LIMITS.allowedTypes.join(",");

/** What the reader will try to decode. Anything a `<canvas>` can draw works. */
export const SCAN_FILE_LIMITS = {
    allowedTypes: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"],
    maxBytes: 12 * 1_024 * 1_024,
} as const;

export const SCAN_ACCEPT_ATTRIBUTE = SCAN_FILE_LIMITS.allowedTypes.join(",");

/** How often the camera loop asks the decoder to look at a frame. */
export const CAMERA_SCAN_INTERVAL_MS = 180;

/** Names this tool's Turnstile challenge in Cloudflare's dashboard. */
export const TURNSTILE_ACTION = "qr-dynamic";

export const DEFAULT_DRAFT: QrDraft = {
    url: "",
    text: "",
    wifi: { ssid: "", password: "", encryption: "WPA", hidden: false },
    contact: { fullName: "", phone: "", email: "", organization: "", url: "", address: "" },
    sms: { phone: "", message: "" },
    email: { address: "", subject: "", body: "" },
    phone: { number: "" },
};

export const DEFAULT_OPTIONS: QrOptions = {
    foreground: DEFAULT_FOREGROUND,
    background: DEFAULT_BACKGROUND,
    dotStyle: "square",
    eyeStyle: "square",
    margin: DEFAULT_MARGIN,
    logo: null,
    level: DEFAULT_ERROR_LEVEL,
    pixelSize: DEFAULT_PIXEL_SIZE,
};
