/**
 * The sizes the reader can ask for. `max` asks for more than any webcam has, so
 * the browser answers with the camera's largest mode — left unasked, Chrome
 * opens every camera at 640 × 480.
 */
export const RESOLUTION_PRESETS = ["max", "uhd", "qhd", "full-hd", "hd", "vga"] as const;

export type ResolutionPreset = (typeof RESOLUTION_PRESETS)[number];

/** `getCapabilities()` entries reported as a numeric range. */
export const RANGE_CAPABILITIES = ["width", "height", "frameRate", "zoom"] as const;

export type RangeCapability = (typeof RANGE_CAPABILITIES)[number];

/** `getCapabilities()` entries reported as a list of values. */
export const LIST_CAPABILITIES = ["facingMode", "resizeMode"] as const;

export type ListCapability = (typeof LIST_CAPABILITIES)[number];

export type CapabilityRow =
    | {
          readonly kind: "range";
          readonly key: RangeCapability;
          readonly min: number;
          readonly max: number;
      }
    | {
          readonly kind: "list";
          readonly key: ListCapability;
          readonly values: readonly string[];
      };

/** How the delivered size compares with the one asked for. */
export type DeliveryVerdict = "largest" | "matched" | "smaller" | "different";
