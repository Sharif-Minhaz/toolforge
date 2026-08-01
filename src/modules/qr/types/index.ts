/**
 * What the code carries. Each kind maps to a serialisation every mainstream
 * scanner already knows how to act on — a `WIFI:` string joins a network, a
 * vCard offers to save a contact — so the value of picking the right one is
 * that the phone does something useful instead of showing a wall of text.
 */
export const QR_PAYLOAD_KINDS = [
    "url",
    "text",
    "wifi",
    "contact",
    "sms",
    "email",
    "phone",
] as const;

export type QrPayloadKind = (typeof QR_PAYLOAD_KINDS)[number];

/**
 * Error-correction levels, named as the specification names them. Data, not
 * copy: `H` is `H` in every locale.
 */
export const QR_ERROR_LEVELS = ["L", "M", "Q", "H"] as const;

export type QrErrorLevel = (typeof QR_ERROR_LEVELS)[number];

/** Roughly how much of the code each level can lose and still decode. */
export const QR_ERROR_LEVEL_RECOVERY: Record<QrErrorLevel, number> = {
    L: 0.07,
    M: 0.15,
    Q: 0.25,
    H: 0.3,
};

export const QR_DOT_STYLES = ["square", "rounded", "smooth"] as const;

export type QrDotStyle = (typeof QR_DOT_STYLES)[number];

export const QR_EYE_STYLES = ["square", "rounded", "dot"] as const;

export type QrEyeStyle = (typeof QR_EYE_STYLES)[number];

/** The three values `WIFI:T:` accepts, spelled the way scanners expect. */
export const WIFI_ENCRYPTIONS = ["WPA", "WEP", "nopass"] as const;

export type WifiEncryption = (typeof WIFI_ENCRYPTIONS)[number];

export const QR_EXPORT_FORMATS = ["png", "svg"] as const;

export type QrExportFormat = (typeof QR_EXPORT_FORMATS)[number];

/* --------------------------------------------------------------- payload --- */

export type WifiFields = {
    readonly ssid: string;
    readonly password: string;
    readonly encryption: WifiEncryption;
    readonly hidden: boolean;
};

export type ContactFields = {
    readonly fullName: string;
    readonly phone: string;
    readonly email: string;
    readonly organization: string;
    readonly url: string;
    readonly address: string;
};

export type SmsFields = {
    readonly phone: string;
    readonly message: string;
};

export type EmailFields = {
    readonly address: string;
    readonly subject: string;
    readonly body: string;
};

export type PhoneFields = {
    readonly number: string;
};

/**
 * Every kind's fields at once. The workbench keeps all seven filled in as the
 * reader switches tabs, so a half-typed vCard is still there after a detour
 * through the Wi-Fi form.
 */
export type QrDraft = {
    readonly url: string;
    readonly text: string;
    readonly wifi: WifiFields;
    readonly contact: ContactFields;
    readonly sms: SmsFields;
    readonly email: EmailFields;
    readonly phone: PhoneFields;
};

/** One kind's fields, pulled out of the draft and ready to serialise. */
export type QrPayload =
    | { readonly kind: "url"; readonly url: string }
    | { readonly kind: "text"; readonly text: string }
    | ({ readonly kind: "wifi" } & WifiFields)
    | ({ readonly kind: "contact" } & ContactFields)
    | ({ readonly kind: "sms" } & SmsFields)
    | ({ readonly kind: "email" } & EmailFields)
    | ({ readonly kind: "phone" } & PhoneFields);

/* ---------------------------------------------------------------- matrix --- */

/**
 * A finished symbol. `modules` is row-major, one byte per module, `1` for dark —
 * a flat array rather than nested, because every consumer walks it linearly and
 * the styling pass reads neighbours by arithmetic.
 */
export type QrMatrix = {
    /** Modules per side, excluding the quiet zone. Always `4 × version + 17`. */
    readonly size: number;
    readonly version: number;
    readonly level: QrErrorLevel;
    /** Which of the eight mask patterns scored best. */
    readonly mask: number;
    readonly modules: Uint8Array;
};

export type QrEncodeFailureReason = "empty" | "too_long";

export type QrEncodeResult =
    | { readonly ok: true; readonly matrix: QrMatrix }
    | { readonly ok: false; readonly reason: QrEncodeFailureReason };

/* ----------------------------------------------------------------- style --- */

export type QrLogo = {
    /** A `data:` URL, so the SVG stays self-contained and the canvas untainted. */
    readonly dataUrl: string;
    /** Side of the logo square as a fraction of the code's own width. */
    readonly scale: number;
};

export type QrStyle = {
    /** `#rrggbb`. Validated before it reaches the renderer. */
    readonly foreground: string;
    /** `#rrggbb`, or `transparent` for a code that sits on whatever is behind it. */
    readonly background: string;
    readonly dotStyle: QrDotStyle;
    readonly eyeStyle: QrEyeStyle;
    /** Quiet-zone width in modules. Four is the specification's minimum. */
    readonly margin: number;
    readonly logo: QrLogo | null;
};

/** Everything the workbench holds beyond the payload itself. */
export type QrOptions = QrStyle & {
    readonly level: QrErrorLevel;
    /** Side of the exported PNG in pixels; the SVG scales to anything. */
    readonly pixelSize: number;
};

/* --------------------------------------------------------------- dynamic --- */

export type DynamicQrLink = {
    readonly slug: string;
    readonly target: string;
    readonly scans: number;
    readonly createdAt: Date;
    readonly lastScanAt: Date | null;
};

/**
 * A link plus the token that lets its owner edit it. Returned exactly once, by
 * the action that created it — the token is only ever stored hashed.
 */
export type DynamicQrCreation = {
    readonly link: DynamicQrLink;
    readonly editToken: string;
};

export type DynamicQrFailureReason =
    | "not_configured"
    | "invalid_target"
    | "target_too_long"
    | "unsupported_scheme"
    | "self_referential"
    | "challenge_required"
    | "challenge_failed"
    | "not_found"
    | "storage_unavailable";

export type DynamicQrResult<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly reason: DynamicQrFailureReason };

/**
 * A stored link on its way to the browser. Timestamps are ISO strings rather
 * than `Date`s: this shape crosses a server-action boundary, and a string is
 * the one representation that survives it unchanged in every runtime.
 */
export type DynamicQrLinkView = {
    readonly slug: string;
    /** The absolute link a scanner follows, and the one that gets printed. */
    readonly shortUrl: string;
    readonly target: string;
    readonly scans: number;
    readonly createdAt: string;
    readonly lastScanAt: string | null;
};

/** The same, plus the one-time link that lets the owner re-point the code. */
export type DynamicQrCreatedView = DynamicQrLinkView & {
    readonly editUrl: string;
};

/* ---------------------------------------------------------------- reader --- */

/**
 * What a scanned code turned out to hold. `fields` is already split into
 * labelled parts so the reader panel can show a Wi-Fi password on its own row
 * instead of leaving the raw `WIFI:T:WPA;S:…` string to be read by eye.
 */
export type ScannedPayload = {
    readonly kind: QrPayloadKind;
    readonly text: string;
    readonly fields: readonly ScannedField[];
};

export type ScannedField = {
    /** Message-key suffix under `qr.scannedFields`, so it stays a literal union. */
    readonly name: ScannedFieldName;
    readonly value: string;
};

export const SCANNED_FIELD_NAMES = [
    "url",
    "text",
    "ssid",
    "password",
    "encryption",
    "hidden",
    "fullName",
    "organization",
    "phone",
    "email",
    "address",
    "subject",
    "body",
    "message",
] as const;

export type ScannedFieldName = (typeof SCANNED_FIELD_NAMES)[number];

export type ScanFailureReason = "no_code" | "unreadable_image" | "camera_denied" | "camera_missing";
