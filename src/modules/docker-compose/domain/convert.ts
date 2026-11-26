import type { ConversionNote, ConversionResult, DockerComposeDirection } from "../types";
import { emitCompose } from "./emit-compose";
import { emitRunCommands } from "./emit-run";
import { parseComposeFile } from "./parse-compose";
import { parseRunCommands } from "./parse-run";

function dedupeNotes(notes: readonly ConversionNote[]): readonly ConversionNote[] {
    const seen = new Set<string>();

    return notes.filter((note) => {
        const key = `${note.id} ${note.detail ?? ""}`;

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);

        return true;
    });
}

/** The one entry point the page, the island and the MCP adapter all call. */
export function convert(direction: DockerComposeDirection, input: string): ConversionResult {
    if (direction === "runToCompose") {
        const parsed = parseRunCommands(input);

        if (!parsed.ok) {
            return parsed;
        }

        return {
            ok: true,
            output: emitCompose(parsed.services),
            services: parsed.services,
            notes: dedupeNotes(parsed.notes),
        };
    }

    const parsed = parseComposeFile(input);

    if (!parsed.ok) {
        return parsed;
    }

    const emitted = emitRunCommands(parsed.services);

    return {
        ok: true,
        output: emitted.output,
        services: parsed.services,
        notes: dedupeNotes([...parsed.notes, ...emitted.notes]),
    };
}
