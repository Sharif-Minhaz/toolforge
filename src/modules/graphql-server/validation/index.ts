import { z } from "zod";

import { MAX_UPLOAD_BYTES } from "@/modules/tools/domain/document-limits";
import { RECOVERY_KEY_LENGTH } from "@/modules/tools/domain/recovery-key";
import { SERVER_KEY_LENGTH } from "@/modules/tools/domain/server-key";
import { SERVER_NAME_LENGTH } from "@/modules/tools/domain/server-name";
import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";

import { MAX_QUERY_LENGTH } from "../domain/constants";

/**
 * The shape of everything crossing a Server Action boundary into the studio.
 *
 * Only that the right *kind* of thing arrived. Whether a name is usable after
 * whitespace collapses, whether a recovery key survives Crockford folding,
 * whether a document is a usable `db.json`, and whether the caller owns the
 * server are all semantic questions, and they stay in `domain/` and
 * `repository/` where they can return a reason the UI can name. A Zod failure
 * here means somebody bypassed the form.
 */

export const turnstileTokenSchema = z.string().min(1).max(MAX_TURNSTILE_TOKEN_LENGTH);

/**
 * Bounded generously rather than exactly, and normalised nowhere.
 * `checkServerName` owns the real rule, and letting a name that is only
 * *slightly* too long reach it is what lets the UI say "too long" instead of
 * "invalid".
 */
export const serverNameSchema = z.string().max(SERVER_NAME_LENGTH.max * 4);

export const serverKeySchema = z.string().max(SERVER_KEY_LENGTH.max * 2);

/**
 * The document, as text.
 *
 * Capped at twice the upload ceiling rather than at it, so a document that is
 * merely too big is refused by `readDocument` with a reason the UI can render —
 * "this is over the limit" — instead of by Zod with nothing to say. The factor
 * is what stops somebody posting a gigabyte to a Server Action to find out.
 */
export const documentTextSchema = z.string().max(MAX_UPLOAD_BYTES * 2);

/** Formatted or not, spaced or not: `normalizeRecoveryKey` owns the real rule. */
export const recoveryKeySchema = z
    .string()
    .min(RECOVERY_KEY_LENGTH)
    .max(RECOVERY_KEY_LENGTH * 4);

export const serverRefSchema = z.object({
    serverId: z.uuid(),
});

export const createServerSchema = z.object({
    name: serverNameSchema,
    /** Blank means "draw one for me" — `suggestServerKey` then `createServerKey`. */
    key: serverKeySchema,
    document: documentTextSchema,
    token: turnstileTokenSchema,
});

export const importServerSchema = z.object({
    recoveryKey: recoveryKeySchema,
    token: turnstileTokenSchema,
});

export const renameServerSchema = serverRefSchema.extend({
    name: serverNameSchema,
});

export const replaceDocumentSchema = serverRefSchema.extend({
    document: documentTextSchema,
});

export const setPausedSchema = serverRefSchema.extend({
    isPaused: z.boolean(),
});

/**
 * There is deliberately **no schema for running a query**, because there is no
 * Server Action that runs one.
 *
 * The studio's Run button posts to the real public endpoint at
 * `/g/<key>` from the browser, exactly as any other client would. That is worth
 * one paragraph because the obvious alternative — a Server Action that runs the
 * query with the owner's privileges — would make the studio a *different* client
 * from every other one: it would skip the transport rules, skip the rate limit,
 * and skip the `GET`/`POST` split, so a query that worked on the page could fail
 * from `curl` and nobody would know why. What the reader tests here is what
 * their own code will get.
 */
export { MAX_QUERY_LENGTH };
