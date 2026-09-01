import { z } from "zod";

import {
    MAX_SHARED_TEXT_LENGTH,
    MAX_SORT_INPUT_LENGTH,
    MAX_START_NUMBER,
    MIN_START_NUMBER,
} from "../domain/constants";
import {
    BULLET_STYLES,
    LIST_FORMATS,
    NUMBER_STYLES,
    SORT_KEYS,
    SORT_ORDERS,
    SPLIT_MODES,
} from "../types";

export const splitModeSchema = z.enum(SPLIT_MODES);
export const sortOrderSchema = z.enum(SORT_ORDERS);
export const sortKeySchema = z.enum(SORT_KEYS);
export const listFormatSchema = z.enum(LIST_FORMATS);
export const bulletStyleSchema = z.enum(BULLET_STYLES);
export const numberStyleSchema = z.enum(NUMBER_STYLES);

export const startNumberSchema = z.number().int().min(MIN_START_NUMBER).max(MAX_START_NUMBER);

export const sortTextSchema = z.string().max(MAX_SORT_INPUT_LENGTH);

export const sortOptionsSchema = z.object({
    splitMode: splitModeSchema,
    order: sortOrderSchema,
    sortKey: sortKeySchema,
    caseSensitive: z.boolean(),
    trim: z.boolean(),
    removeEmpty: z.boolean(),
    removeDuplicates: z.boolean(),
    stripMarkers: z.boolean(),
    format: listFormatSchema,
    bulletStyle: bulletStyleSchema,
    numberStyle: numberStyleSchema,
    startNumber: startNumberSchema,
});

/**
 * Search-param shape for `/tools/sort?text=b%0Aa&order=ascending&format=bullet`.
 * Each field catches on its own, so one malformed value degrades to the default
 * instead of throwing the whole page away.
 */
export const sortSearchParamsSchema = z.object({
    text: z.string().max(MAX_SHARED_TEXT_LENGTH).optional().catch(undefined),
    order: sortOrderSchema.optional().catch(undefined),
    format: listFormatSchema.optional().catch(undefined),
    split: splitModeSchema.optional().catch(undefined),
});
