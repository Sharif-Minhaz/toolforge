import { z } from "zod";

import { DEFAULT_DIRECTION } from "@/modules/docker-compose/domain/constants";
import { convert } from "@/modules/docker-compose/domain/convert";
import {
    dockerComposeDirectionSchema,
    dockerComposeInputSchema,
} from "@/modules/docker-compose/validation/docker-compose-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

export const dockerComposeConvertTool = defineMcpTool({
    toolId: "docker-compose",
    verb: "convert",
    title: "Convert between docker run and Compose",
    description:
        "Convert one or several `docker run` commands (bash, cmd or PowerShell) into a `compose.yaml`, or a compose file back into `docker run` commands. Maps ports, volumes and `--mount`, environment, networks, restart policies, resource limits, healthchecks, ulimits, logging and around eighty other flags. Escapes `$` for compose's interpolation and keeps shell variables as variables. Reports every flag or key that has no equivalent on the other side, rather than dropping it silently.",
    kind: "offline",
    inputSchema: z.object({
        direction: dockerComposeDirectionSchema
            .default(DEFAULT_DIRECTION)
            .describe(
                "`runToCompose` reads docker run commands; `composeToRun` reads a compose file",
            ),
        input: dockerComposeInputSchema.describe("The commands or the YAML, exactly as written"),
    }),
    run: ({ direction, input }) => {
        const result = convert(direction, input);

        if (!result.ok) {
            return refuseWithReason("docker compose converter", result.reason, {
                token: result.token ?? null,
                line: result.line ?? null,
            });
        }

        return succeed(
            direction === "runToCompose"
                ? `Converted to a compose file with ${result.services.length} service(s)`
                : `Converted to ${result.services.length} docker run command(s)`,
            {
                output: result.output,
                services: result.services.map((service) => service.key),
                notes: result.notes.map((note) => ({
                    id: note.id,
                    kind: note.kind,
                    detail: note.detail ?? null,
                })),
            },
        );
    },
});
