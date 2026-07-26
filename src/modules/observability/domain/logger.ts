type LogLevel = "warn" | "error";

type LogPayload = Record<string, string | number | boolean | null>;

/**
 * Minimal structured logger. Emits a single JSON line so browser and server
 * output can be filtered or shipped without parsing free-form strings.
 */
export function logEvent(level: LogLevel, event: string, payload: LogPayload = {}): void {
    const entry = JSON.stringify({ level, event, at: new Date().toISOString(), ...payload });

    if (level === "error") {
        globalThis.console.error(entry);

        return;
    }

    globalThis.console.warn(entry);
}

export function describeError(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
