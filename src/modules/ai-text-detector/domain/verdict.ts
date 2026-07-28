import { CONFIDENCE_BAND_THRESHOLDS, MAX_REASONING_LENGTH } from "./constants";
import type { ConfidenceBand, DetectionLabel, DetectionVerdict } from "../types";

/**
 * The model is asked for three exact labels and mostly obliges, but "AI
 * generated", "Machine-generated" and "Partially AI" all turn up. Aliases are
 * spelled out rather than matched by substring: "human-written" contains no
 * marker that a fuzzy rule could safely key on, and a wrong guess here reverses
 * the answer.
 */
const LABEL_ALIASES: Record<string, DetectionLabel> = {
    ai: "ai-generated",
    aigenerated: "ai-generated",
    aiwritten: "ai-generated",
    machinegenerated: "ai-generated",
    llmgenerated: "ai-generated",
    human: "human-written",
    humanwritten: "human-written",
    humangenerated: "human-written",
    mixed: "mixed",
    partiallyai: "mixed",
    partiallyaigenerated: "mixed",
    aiassisted: "mixed",
};

export function normalizeDetectionLabel(raw: unknown): DetectionLabel {
    if (typeof raw !== "string") {
        return "unknown";
    }

    const key = raw.toLowerCase().replace(/[^a-z]/g, "");

    return LABEL_ALIASES[key] ?? "unknown";
}

/**
 * Confidence arrives as a number, occasionally as `"85"`, and once in a while
 * as nonsense. Anything unusable reads as zero rather than as certainty.
 */
export function clampConfidence(raw: unknown): number {
    const value =
        typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;

    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(100, Math.max(0, Math.round(value)));
}

export function toConfidenceBand(confidence: number): ConfidenceBand {
    if (confidence >= CONFIDENCE_BAND_THRESHOLDS.high) {
        return "high";
    }

    return confidence >= CONFIDENCE_BAND_THRESHOLDS.moderate ? "moderate" : "low";
}

function normalizeReasoning(raw: unknown): string {
    if (typeof raw !== "string") {
        return "";
    }

    const collapsed = raw.replace(/\s+/gu, " ").trim();

    return collapsed.length > MAX_REASONING_LENGTH
        ? `${collapsed.slice(0, MAX_REASONING_LENGTH).trimEnd()}…`
        : collapsed;
}

export type DetectorPayload = {
    readonly label?: unknown;
    readonly confidence?: unknown;
    readonly reasoning?: unknown;
    readonly model?: unknown;
};

/**
 * Turns whatever the worker returned into the shape the UI renders. A label it
 * cannot place becomes `unknown` with zero confidence, so an unparseable answer
 * never masquerades as a decisive one.
 */
export function toDetectionVerdict(payload: DetectorPayload): DetectionVerdict {
    const label = normalizeDetectionLabel(payload.label);
    const confidence = label === "unknown" ? 0 : clampConfidence(payload.confidence);

    return {
        label,
        confidence,
        band: toConfidenceBand(confidence),
        reasoning: normalizeReasoning(payload.reasoning),
        model: typeof payload.model === "string" ? payload.model : "",
    };
}
