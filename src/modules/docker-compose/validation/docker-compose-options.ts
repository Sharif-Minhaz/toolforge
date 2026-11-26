import { z } from "zod";

import { MAX_INPUT_LENGTH, MAX_SHARED_INPUT_LENGTH } from "../domain/constants";
import { DOCKER_COMPOSE_DIRECTIONS } from "../types";

export const dockerComposeDirectionSchema = z.enum(DOCKER_COMPOSE_DIRECTIONS);

export const dockerComposeInputSchema = z.string().max(MAX_INPUT_LENGTH);

export const dockerComposeSearchParamsSchema = z.object({
    direction: dockerComposeDirectionSchema.optional().catch(undefined),
    input: z.string().max(MAX_SHARED_INPUT_LENGTH).optional().catch(undefined),
});
