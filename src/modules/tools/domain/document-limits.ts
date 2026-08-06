/**
 * Every ceiling a hosted JSON document is held to, named once for both studios.
 *
 * These moved out of `json-server/domain/constants.ts` when the GraphQL Server
 * Studio arrived, and sharing them is a decision rather than a convenience: a
 * `db.json` that one studio accepts and the other refuses would make "which one
 * should I use" a question about file size instead of about REST versus GraphQL.
 * Each module keeps its own constants for what is genuinely its own — a path
 * prefix, a cookie name, a query-language bound.
 */

// ─── Document size: two numbers, and the gap between them is the feature ────

/**
 * The largest document that may be *uploaded* — pasted, imported, or written
 * back from a studio's own editor.
 *
 * Below `MAX_DOCUMENT_BYTES` on purpose. A server created at exactly its own
 * ceiling would be full before its first write, so the first thing a new visitor
 * met would be a refusal. The gap is the room to actually use the thing.
 */
export const MAX_UPLOAD_BYTES = 900 * 1_024;

/**
 * The hard ceiling on the stored document.
 *
 * Reaching it locks the operations that make the document *bigger* — and only
 * those. Reading and deleting keep working, which is what makes the lock
 * recoverable: a full server can still be read, and deleting a record is the way
 * out. A ceiling that also blocked deletion would be a trap rather than a limit,
 * and the only escape would be discarding the whole document.
 *
 * Each studio's gate reads a stored `sizeBytes` column rather than measuring, so
 * guarding a write costs a column rather than a serialisation of the megabyte
 * being guarded.
 */
export const MAX_DOCUMENT_BYTES = 1_024 * 1_024;

/**
 * The point at which a studio starts saying so, as a fraction of the ceiling.
 *
 * A limit somebody meets without warning reads as a fault. At 80% the usage bar
 * changes tone and the copy names the number, so the lock is something a visitor
 * saw coming rather than something that happened to them.
 */
export const DOCUMENT_WARN_RATIO = 0.8;

// ─── Document shape ─────────────────────────────────────────────────────────

/** Top-level keys. Each is a collection or a singular resource. */
export const MAX_COLLECTIONS = 50;

/**
 * Records in one collection.
 *
 * The byte ceiling bounds this already for any realistic record, but a
 * collection of a hundred thousand `1`s would fit and would make every write a
 * hundred-thousand-element rewrite. This is the bound on *work*, not on size.
 */
export const MAX_ITEMS_PER_COLLECTION = 10_000;

/** Matches `MAX_JSON_DEPTH`'s job: a bound the reader can report rather than crash on. */
export const MAX_DOCUMENT_DEPTH = 24;

/**
 * A resource name has to survive being published and being read aloud.
 *
 * Deliberately narrower than JSON allows a key to be: `posts` and `blog_posts`
 * are resources, `a/b` and `?x` are not. A key that needed escaping to appear in
 * a URL would make its own REST routes unusable, and one outside this set cannot
 * become a GraphQL field name either — the two constraints happen to coincide,
 * which is why one pattern serves both. Keys outside it are not an error; they
 * are simply not published, and each studio says so.
 */
export const RESOURCE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const MAX_RESOURCE_NAME_LENGTH = 64;
