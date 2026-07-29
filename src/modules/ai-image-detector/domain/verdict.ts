import { MAX_IMAGE_REASONING_LENGTH } from "./constants";
import type { ImageConfidenceBand, ImageVerdict, ImageVerdictLabel } from "../types";

/**
 * The model is asked for `low`, `medium` or `high` and mostly obliges, but
 * "moderate" and "very high" turn up too. Aliases are spelled out rather than
 * matched loosely: everything unrecognised has to land on `unknown`, because
 * that value is what stops a non-answer being shown as a finding.
 */
const BAND_ALIASES: Record<string, ImageConfidenceBand> = {
    low: "low",
    verylow: "low",
    medium: "medium",
    moderate: "medium",
    mid: "medium",
    high: "high",
    veryhigh: "high",
};

export function normalizeConfidenceBand(raw: unknown): ImageConfidenceBand {
    if (typeof raw !== "string") {
        return "unknown";
    }

    return BAND_ALIASES[raw.toLowerCase().replace(/[^a-z]/g, "")] ?? "unknown";
}

function normalizeReasoning(raw: unknown): string {
    if (typeof raw !== "string") {
        return "";
    }

    const collapsed = raw.replace(/\s+/gu, " ").trim();

    return collapsed.length > MAX_IMAGE_REASONING_LENGTH
        ? `${collapsed.slice(0, MAX_IMAGE_REASONING_LENGTH).trimEnd()}…`
        : collapsed;
}

export type ImageDetectorPayload = {
    readonly is_ai_generated?: unknown;
    readonly confidence?: unknown;
    readonly reasoning?: unknown;
};

/**
 * Turns whatever the worker returned into the shape the UI renders.
 *
 * The band decides whether there is an answer at all. When the model replies
 * with something the worker cannot parse, the worker's own fallback is
 * `is_ai_generated: false` alongside `confidence: "unknown"` — and reading that
 * `false` as "authentic" would turn a parse failure into a clean bill of
 * health. So an unplaceable band collapses the whole verdict to `unknown`.
 */
export function toImageVerdict(payload: ImageDetectorPayload): ImageVerdict {
    const band = normalizeConfidenceBand(payload.confidence);
    const decided = band !== "unknown" && typeof payload.is_ai_generated === "boolean";

    const label: ImageVerdictLabel = !decided
        ? "unknown"
        : payload.is_ai_generated
          ? "ai-generated"
          : "authentic";

    return {
        label,
        band: decided ? band : "unknown",
        reasoning: normalizeReasoning(payload.reasoning),
    };
}
