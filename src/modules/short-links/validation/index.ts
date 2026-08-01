import { z } from "zod";

import {
    ALIAS_LENGTH,
    EDIT_TOKEN_LENGTH,
    MAX_TARGET_URL_LENGTH,
    PASSWORD_LENGTH,
} from "../domain/constants";
import { isResolvableSlug, isValidEditToken } from "../domain/slug";
import { LINK_STATES } from "../types";

/**
 * The shape of everything that crosses a server-action boundary on its way to a
 * short link. Semantic checks — is this alias reserved, is this window possible,
 * does this target point back at us — stay in `domain/`; this file only
 * establishes that the right kind of thing arrived.
 */

export const targetUrlSchema = z.string().trim().min(1).max(MAX_TARGET_URL_LENGTH);

export const slugSchema = z.string().refine(isResolvableSlug);

export const editTokenSchema = z.string().length(EDIT_TOKEN_LENGTH).refine(isValidEditToken);

/**
 * Bounded generously and normalised nowhere: `parseAlias` owns the real rule,
 * and letting a slightly wrong alias through to it is what produces a message
 * about hyphens rather than a bare "invalid input".
 */
export const aliasSchema = z
    .string()
    .trim()
    .max(ALIAS_LENGTH.max * 2);

export const linkPasswordSchema = z.string().min(1).max(PASSWORD_LENGTH.max);

/**
 * Instants, always. The browser turns the reader's wall-clock date and chosen
 * zone into one of these before sending it, so nothing on the server has to
 * guess which zone a bare `2026-08-09T17:00` was written in.
 */
export const instantSchema = z.iso.datetime();

export const scheduleSchema = z.object({
    startsAt: instantSchema.nullable(),
    expiresAt: instantSchema.nullable(),
});

/**
 * What the create action accepts. The Turnstile token is required here and not
 * merely checked in the action, so a request that forgot it is rejected before
 * anything touches the database.
 */
export const createShortLinkSchema = z.object({
    target: targetUrlSchema,
    alias: aliasSchema.nullable(),
    password: linkPasswordSchema.nullable(),
    startsAt: instantSchema.nullable(),
    expiresAt: instantSchema.nullable(),
    token: z.string().min(1),
});

/**
 * `password` is three-valued on purpose: `undefined` leaves the existing one
 * alone, `null` removes it, a string replaces it. A boolean pair would let
 * "set" and "clear" arrive together.
 */
export const updateShortLinkSchema = z.object({
    editToken: editTokenSchema,
    target: targetUrlSchema,
    password: linkPasswordSchema.nullable().optional(),
    startsAt: instantSchema.nullable(),
    expiresAt: instantSchema.nullable(),
});

export const unlockShortLinkSchema = z.object({
    slug: slugSchema,
    password: linkPasswordSchema,
});

/**
 * `?state=expired` on a tool page, set by the redirect route. Catches on its
 * own so a hand-typed value opens the tool rather than throwing the page away.
 */
export const linkStateSchema = z.enum(LINK_STATES).optional().catch(undefined);
