/**
 * Why a camera or a microphone did not start, as a name the page can explain.
 *
 * Nothing in here knows which kind of device was asked for: the browser answers
 * a microphone request with the same errors, so the microphone tester reads the
 * same names.
 */
export const MEDIA_FAILURES = [
    "insecure_context",
    "unsupported",
    "denied",
    "no_device",
    "in_use",
    "overconstrained",
    "ended",
    "failed",
] as const;

export type MediaFailure = (typeof MEDIA_FAILURES)[number];

/** What has to be true before asking can work. Injected, so tests need no browser. */
export type MediaEnvironment = {
    readonly isSecureContext: boolean;
    readonly hasGetUserMedia: boolean;
};

/**
 * A failure known before the browser is asked anything, or `null`.
 *
 * The secure-context check comes first: on a plain-http page Chrome removes
 * `navigator.mediaDevices` altogether, and reporting that as `unsupported` would
 * blame the browser for the address.
 */
export function checkMediaEnvironment(environment: MediaEnvironment): MediaFailure | null {
    if (!environment.isSecureContext) {
        return "insecure_context";
    }

    return environment.hasGetUserMedia ? null : "unsupported";
}

/**
 * `getUserMedia` rejection names, current and pre-standard. The second name in
 * each pair is what older Chrome threw before the specification settled them.
 */
const FAILURE_BY_ERROR_NAME: ReadonlyMap<string, MediaFailure> = new Map([
    ["NotAllowedError", "denied"],
    ["PermissionDeniedError", "denied"],
    // A permissions policy or a browser setting that disables capture for the page.
    ["SecurityError", "denied"],
    ["NotFoundError", "no_device"],
    ["DevicesNotFoundError", "no_device"],
    // The device exists and access was granted, but the system could not open it —
    // almost always another app holding it.
    ["NotReadableError", "in_use"],
    ["TrackStartError", "in_use"],
    // Chrome's `OverconstrainedError` is not a `DOMException`, so the name is
    // read off whatever was thrown rather than through `instanceof`.
    ["OverconstrainedError", "overconstrained"],
    ["ConstraintNotSatisfiedError", "overconstrained"],
]);

/**
 * Names a `getUserMedia` rejection. Anything unrecognised — `AbortError`, a
 * `TypeError`, a non-error — is `failed`: a refusal of its own rather than a
 * guess at one of the others.
 */
export function classifyMediaError(caught: unknown): MediaFailure {
    const name =
        typeof caught === "object" &&
        caught !== null &&
        "name" in caught &&
        typeof caught.name === "string"
            ? caught.name
            : "";

    return FAILURE_BY_ERROR_NAME.get(name) ?? "failed";
}
