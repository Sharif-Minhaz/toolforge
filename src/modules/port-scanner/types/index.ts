import type { IpVersion } from "@/modules/tools/types";

/**
 * The three answers a TCP connect scan can actually give, and the distinction
 * most hosted port checkers get wrong.
 *
 * - `open` — the handshake completed. Something is listening.
 * - `closed` — the host answered with a reset. Nothing is listening, and the
 *   host told us so, which means it is reachable and not firewalled here.
 * - `filtered` — nothing came back before the deadline. A packet filter dropped
 *   it silently, or the host is gone.
 *
 * Folding `filtered` into `closed` is the common shortcut and it is a lie about
 * the network: "refused" and "silently dropped" are different facts, and the
 * second is usually the interesting one.
 */
export const PORT_STATES = ["open", "closed", "filtered"] as const;

export type PortState = (typeof PORT_STATES)[number];

export type PortResult = {
    readonly port: number;
    readonly state: PortState;
    /** Milliseconds to the handshake or the reset; `null` when it timed out. */
    readonly latencyMs: number | null;
    /**
     * The service conventionally registered on this port, from a static table.
     * It is what the port is *for*, never what answered — nothing here reads a
     * banner, so this is a label, not a finding.
     */
    readonly service: string | null;
};

/**
 * Named groups a reader picks instead of typing numbers. `custom` is the escape
 * hatch and is the only one that reads the port field.
 */
export const PORT_PRESETS = ["top", "web", "mail", "database", "remote", "custom"] as const;

export type PortPreset = (typeof PORT_PRESETS)[number];

export type PortSpecFailureReason = "no_ports" | "invalid_ports" | "too_many_ports";

export type PortSpecResult =
    | { readonly ok: true; readonly ports: readonly number[] }
    | {
          readonly ok: false;
          readonly reason: PortSpecFailureReason;
          /** The fragment that could not be read, for a message that points. */
          readonly token?: string;
          /** How many were asked for, when that is what went wrong. */
          readonly count?: number;
      };

/**
 * How many scans this visitor has left, and when the window turns over.
 *
 * Carried back with every result — including the refusals — because a reader
 * who has run out needs to know that before they retype the host.
 */
export type QuotaState = {
    readonly limit: number;
    readonly used: number;
    readonly remaining: number;
    /** ISO-8601. The whole report crosses a Server Action boundary. */
    readonly resetsAt: string;
};

export type ScanFailureReason =
    | "empty_input"
    | "too_long"
    | "invalid_hostname"
    | "unresolved"
    | "blocked_address"
    | "no_address"
    | "no_ports"
    | "invalid_ports"
    | "too_many_ports"
    | "quota_exceeded"
    | "turnstile_failed"
    | "scan_failed";

export type ScanFailure = {
    readonly ok: false;
    readonly reason: ScanFailureReason;
    readonly token?: string;
    readonly count?: number;
    /** Present whenever the quota could be read, refusals included. */
    readonly quota?: QuotaState;
};

export type ScanReport = {
    readonly ok: true;
    /** What the reader typed, normalised — a name or a literal address. */
    readonly hostname: string;
    /** The address actually connected to. Never re-resolved after the check. */
    readonly address: string;
    readonly version: IpVersion;
    readonly results: readonly PortResult[];
    readonly summary: ScanSummary;
    /** ISO-8601, stamped on the server so both locales format one instant. */
    readonly startedAt: string;
    readonly durationMs: number;
    readonly quota: QuotaState;
};

export type ScanSummary = {
    readonly total: number;
    readonly open: number;
    readonly closed: number;
    readonly filtered: number;
};

export type ScanResult = ScanReport | ScanFailure;

export type ScanRequest = {
    readonly host: string;
    readonly preset: PortPreset;
    /** Read only when `preset` is `custom`. */
    readonly ports: string;
    readonly turnstileToken: string;
};
