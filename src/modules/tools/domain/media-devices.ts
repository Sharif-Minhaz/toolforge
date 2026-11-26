/**
 * The device list and the device half of a capture request, for any kind of
 * input. Nothing here is camera-specific; the microphone tester asks for
 * `"audio"` and gets the same behaviour.
 */
export const MEDIA_KINDS = ["video", "audio"] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

const DEVICE_KIND: Readonly<Record<MediaKind, MediaDeviceKind>> = {
    video: "videoinput",
    audio: "audioinput",
};

/** What the picker reads off a `MediaDeviceInfo`. Structural, so tests pass plain objects. */
export type DeviceInfoLike = {
    readonly deviceId: string;
    readonly kind: string;
    readonly label: string;
};

export type MediaDevice = {
    readonly id: string;
    /** `null` when the browser gave no name; the picker numbers it instead. */
    readonly label: string | null;
    /** 1-based, among devices of the same kind, for that numbered fallback. */
    readonly position: number;
};

/**
 * The inputs of one kind a reader can choose between.
 *
 * Until access is allowed, browsers list at most one placeholder per kind with
 * an empty id and an empty label. It cannot be requested by id, so it is
 * dropped: an empty list means "not allowed yet", never "nothing connected".
 */
export function listInputDevices(
    infos: readonly DeviceInfoLike[],
    kind: MediaKind,
): readonly MediaDevice[] {
    return infos
        .filter((info) => info.kind === DEVICE_KIND[kind] && info.deviceId !== "")
        .map((info, index) => ({
            id: info.deviceId,
            label: info.label.trim() === "" ? null : info.label,
            position: index + 1,
        }));
}

/**
 * The device part of a request. `exact` once the reader has chosen one, so a
 * busy or vanished pick fails with its own name instead of the browser quietly
 * opening a different device; absent otherwise, so the system default answers.
 */
export function deviceConstraint(deviceId: string | null): MediaTrackConstraints {
    return deviceId === null ? {} : { deviceId: { exact: deviceId } };
}
