import { z } from "zod";

import { LOCALES } from "@/i18n/config";

export const localeSchema = z.enum(LOCALES);
