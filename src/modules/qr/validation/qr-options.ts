import { z } from "zod";

import {
    MAX_FIELD_LENGTH,
    MAX_PAYLOAD_LENGTH,
    MAX_TARGET_URL_LENGTH,
    MAX_WIFI_FIELD_LENGTH,
} from "../domain/constants";
import { EDIT_TOKEN_LENGTH, SLUG_LENGTH } from "../domain/constants";
import { isValidEditToken, isValidSlug } from "../domain/short-code";
import {
    QR_DOT_STYLES,
    QR_ERROR_LEVELS,
    QR_EXPORT_FORMATS,
    QR_EYE_STYLES,
    QR_PAYLOAD_KINDS,
    WIFI_ENCRYPTIONS,
} from "../types";

export const qrPayloadKindSchema = z.enum(QR_PAYLOAD_KINDS);

export const qrErrorLevelSchema = z.enum(QR_ERROR_LEVELS);

export const qrDotStyleSchema = z.enum(QR_DOT_STYLES);

export const qrEyeStyleSchema = z.enum(QR_EYE_STYLES);

export const qrExportFormatSchema = z.enum(QR_EXPORT_FORMATS);

export const wifiEncryptionSchema = z.enum(WIFI_ENCRYPTIONS);

/** `#rrggbb` only. Shorthand and named colours are rejected rather than fixed. */
export const hexColorSchema = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .transform((value) => value.toLowerCase());

const fieldSchema = z.string().max(MAX_FIELD_LENGTH);

const wifiFieldSchema = z.string().max(MAX_WIFI_FIELD_LENGTH);

export const qrDraftSchema = z.object({
    url: fieldSchema,
    text: z.string().max(MAX_PAYLOAD_LENGTH),
    wifi: z.object({
        ssid: wifiFieldSchema,
        password: wifiFieldSchema,
        encryption: wifiEncryptionSchema,
        hidden: z.boolean(),
    }),
    contact: z.object({
        fullName: fieldSchema,
        phone: fieldSchema,
        email: fieldSchema,
        organization: fieldSchema,
        url: fieldSchema,
        address: fieldSchema,
    }),
    sms: z.object({ phone: fieldSchema, message: z.string().max(MAX_PAYLOAD_LENGTH) }),
    email: z.object({
        address: fieldSchema,
        subject: fieldSchema,
        body: z.string().max(MAX_PAYLOAD_LENGTH),
    }),
    phone: z.object({ number: fieldSchema }),
});

/**
 * Search-param shape for `/tools/qr?kind=wifi&level=H&fg=%23111111`.
 *
 * Each field catches on its own, so one malformed value opens on a default
 * instead of throwing the whole page away.
 */
export const qrSearchParamsSchema = z.object({
    kind: qrPayloadKindSchema.optional().catch(undefined),
    text: z.string().max(MAX_PAYLOAD_LENGTH).optional().catch(undefined),
    level: qrErrorLevelSchema.optional().catch(undefined),
    dots: qrDotStyleSchema.optional().catch(undefined),
    eyes: qrEyeStyleSchema.optional().catch(undefined),
    fg: hexColorSchema.optional().catch(undefined),
    bg: hexColorSchema.optional().catch(undefined),
});

export type QrSearchParams = z.infer<typeof qrSearchParamsSchema>;

/* --------------------------------------------------------------- dynamic --- */

export const targetUrlSchema = z.string().trim().min(1).max(MAX_TARGET_URL_LENGTH);

export const slugSchema = z.string().length(SLUG_LENGTH).refine(isValidSlug);

export const editTokenSchema = z.string().length(EDIT_TOKEN_LENGTH).refine(isValidEditToken);

/**
 * What the create action accepts. The Turnstile token is required here and not
 * merely checked in the action, so a request that forgot it is rejected before
 * anything touches the database.
 */
export const createDynamicQrSchema = z.object({
    target: targetUrlSchema,
    token: z.string().min(1),
});

export const updateDynamicQrSchema = z.object({
    editToken: editTokenSchema,
    target: targetUrlSchema,
});
