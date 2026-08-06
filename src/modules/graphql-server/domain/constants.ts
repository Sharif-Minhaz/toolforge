/**
 * Every limit the GraphQL Server Studio runs on that is its own, named once.
 *
 * The document's ceilings — upload size, stored size, collection and depth
 * bounds, what a resource name may be — live in
 * `tools/domain/document-limits.ts`, shared with the JSON Server Studio so a
 * `db.json` one accepts is never one the other refuses. What is here is this
 * studio's own: its path prefix, its cookie, and the four bounds that make a
 * public GraphQL endpoint survivable.
 */

/**
 * How many servers one browser holds at a time.
 *
 * An affordance, not a limit: the cookie belongs to the visitor and clearing it
 * buys five more. The limit that actually holds is the creation quota, keyed on
 * a salted digest of the caller's address — see `quota.ts`.
 */
export const MAX_SERVERS_PER_BROWSER = 5;

/**
 * The HttpOnly cookie carrying one secret per owned server.
 *
 * Its own name rather than sharing the JSON studio's, for the reason that studio
 * gives for not sharing the mock one's: two lists with two caps under one name
 * would make "you can hold five of these" and "you can hold five of those" the
 * same sentence, and a visitor at capacity in one studio would be refused in the
 * other.
 */
export const SERVER_COOKIE_NAME = "toolforge.graphqlserver";

/** Creations allowed per address per window. Matches the JSON studio's. */
export const CREATE_QUOTA_LIMIT = 10;

export const CREATE_QUOTA_WINDOW_MS = 60 * 60 * 1_000;

/** Names the challenge in Cloudflare's dashboard, as every other tool does. */
export const TURNSTILE_ACTION = "graphql-server";

/** The path prefix a GraphQL server answers on while the studio is path-hosted. */
export const GRAPHQL_EXECUTION_PREFIX = "/g";

// ─── What a public GraphQL endpoint has to bound ────────────────────────────

/**
 * The four numbers below exist because **GraphQL moves the cost of a request
 * from the server's route table to the client's query**, which REST does not.
 * A `GET /posts` can only ever return one collection; a single GraphQL document
 * can ask for every collection, joined to itself, many times over, from one
 * 200-byte request. Without these, one visitor's `useEffect` is a denial of
 * service and one curious stranger is an outage.
 *
 * They are enforced as *validation rules*, before a single resolver runs — the
 * only order that helps, since the whole point is to refuse the work rather than
 * to measure it afterwards.
 */

/**
 * Longest query document read.
 *
 * Refused rather than truncated: half a GraphQL document is not a smaller
 * query, it is a syntax error, and answering one with a parse failure would be
 * blaming the caller for something this server did.
 */
export const MAX_QUERY_LENGTH = 16 * 1_024;

/**
 * How deeply a selection set may nest.
 *
 * The derived relation fields are **cyclic by construction** — a `Post` has
 * `comments`, and each `Comment` has `post` — so `post { comments { post { … } } }`
 * has no natural end. Twelve is deep enough for any query a person writes by
 * hand against a fixture and far short of where the cost curve turns.
 */
export const MAX_QUERY_DEPTH = 12;

/**
 * The node budget: roughly how many records the whole document may ask for.
 *
 * Depth alone does not bound cost — `posts(perPage: 1000) { comments { … } }` is
 * three levels deep and a million records. The estimate multiplies each list
 * field's requested page size down the tree, so it is an upper bound computed
 * from the query alone, with no document read. See `cost.ts`.
 */
export const MAX_QUERY_COST = 50_000;

/**
 * Root fields in one operation, counting aliases separately.
 *
 * `a: posts b: posts c: posts …` adds no depth and multiplies work, so it is the
 * one shape neither of the two bounds above catches on its own.
 */
export const MAX_ROOT_FIELDS = 24;

/**
 * How many selections the guard's own walk will visit before giving up.
 *
 * A bound on the *analysis*, not on what the analysis estimates, and it is a
 * separate number because it defends against a separate attack. Fragment spreads
 * do not add depth and do not multiply the node estimate, but they do multiply
 * the **walk**: a fragment that spreads two others, each of which spreads two
 * more, is 2ⁿ visits for n fragments — and n is bounded only by
 * `MAX_QUERY_LENGTH`, which leaves room for hundreds. Without this, the function
 * whose job is to refuse expensive queries is itself the expensive query.
 *
 * Generous enough that no hand-written document approaches it: a query naming
 * every field of a fifty-collection schema is a few thousand selections.
 */
export const MAX_ANALYSIS_NODES = 100_000;

// ─── Query arguments ────────────────────────────────────────────────────────

/** `perPage` when a page was asked for and no size was given. */
export const DEFAULT_PER_PAGE = 10;

/** Above this, one list field could serialise most of the document. */
export const MAX_PER_PAGE = 1_000;

// ─── Logging ────────────────────────────────────────────────────────────────

/** Rows kept per server. Older ones are trimmed after a write. */
export const MAX_LOG_ROWS = 50;

/**
 * How much of an operation name is kept on a log row.
 *
 * The **operation name**, not the query. A GraphQL request body is the whole
 * document, and a document is frequently the visitor's own field names against
 * their own data — logging it would mean this service retains a second copy of
 * what it already stores once, which is the same line the JSON studio's log
 * draws and for the same reason.
 */
export const MAX_LOGGED_NAME_LENGTH = 120;
