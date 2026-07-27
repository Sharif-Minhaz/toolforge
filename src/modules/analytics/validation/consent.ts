import { z } from "zod";

import { CONSENT_VALUES } from "../domain/consent";

export const consentSchema = z.enum(CONSENT_VALUES);
