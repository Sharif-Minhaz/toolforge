# Visual Mock Server Studio — System Design

Status: **M0–M8 shipped.** Every milestone on the ladder is done. See §14 for the ladder.
Decisions locked in Phase 1 are marked **[locked]**; everything else is open.

> The Prisma block in §2.1 is the design as first written. Where the shipped
> schema differs — `workspace_secrets` replacing `Workspace.secretHash`, and
> `uuid(7)` keys — `prisma/schema.prisma` is authoritative and carries the
> reasoning at each model. §3 records why the secret moved to its own table.

---

## 1. Shape of the thing

A visitor builds mock HTTP APIs by dragging control-flow nodes onto a canvas and
filling a response tree with value pickers. The graph is persisted as JSONB. A
public request loads the graph, executes it, and returns the response.

Four decisions from the Phase 1 review frame everything below.

| Decision                    | Choice                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node model **[locked]**     | Two tiers — 11 control-flow node kinds on canvas, values as an inline `ValueExpr` union                                                                            |
| Public origin **[locked]**  | Path form `/m/<key>/…` for now — the deployment is on a `*.vercel.app` domain with no wildcard DNS. Designed so the origin is one config value to change. See §4.1 |
| Outbound nodes **[locked]** | `httpRequest` / `webhook` ship last, behind the address guard and a fail-closed quota                                                                              |
| Placement **[locked]**      | Top-level `/mock` section, one catalog entry so search and sitemap find it                                                                                         |

### Why two tiers

A flat graph makes `{id, name, email, profile:{avatar, address:{city, country}}}`
cost fourteen nodes and thirteen edges. Unreal Blueprint has that problem and it
is the reason people call it spaghetti. Splitting control flow from data flow
means the canvas holds eleven node kinds and the object above is six rows in a
tree. Arbitrary nesting comes free because `ValueExpr` is recursive.

The original brief listed the same items twice — once under _Available Nodes_,
once under _Dynamic Data → value providers_. That duplication is what the split
resolves.

---

## 2. Storage

### 2.1 Prisma models

Postgres via the existing `PrismaPg` adapter in `src/lib/prisma.ts`. JSONB for
everything whose shape the application owns rather than the database.

```prisma
enum HttpMethod {
  GET
  POST
  PUT
  PATCH
  DELETE
  HEAD
  OPTIONS
}

enum VariableScope {
  WORKSPACE
  SERVER
  COLLECTION
}

/// A visitor's whole world. There is no account: ownership is proved by a
/// secret held in an HttpOnly cookie, or by a printable recovery key. Both are
/// stored as SHA-256 digests, never as the value itself — a database dump must
/// not hand over the ability to edit somebody's servers.
///
/// SHIPPED DIFFERENCE: the secret lives in `workspace_secrets`, one row per
/// browser, so importing a recovery key adds a claim instead of overwriting the
/// one that already exists. See §3.
model Workspace {
  id           String   @id @default(uuid(7)) @db.Uuid
  name         String
  recoveryHash String   @unique @map("recovery_hash")
  /// Bumped when the recovery key is rotated, so an old key cannot be replayed.
  recoveryEpoch Int     @default(1) @map("recovery_epoch")
  settings     Json     @default("{}") @map("settings")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  /// Touched on every studio load. Powers dormancy sweeps.
  lastSeenAt   DateTime @default(now()) @map("last_seen_at")

  servers   MockServer[]
  variables EnvironmentVariable[]
  logs      RequestLog[]

  @@index([lastSeenAt])
  @@map("workspaces")
}

/// One deployable mock API. `key` is the public subdomain label, so it is
/// globally unique rather than unique per workspace.
model MockServer {
  id          String  @id @default(uuid()) @db.Uuid
  workspaceId String  @map("workspace_id") @db.Uuid
  key         String  @unique
  name        String
  description String?
  /// CORS, default response headers, content-type policy, base latency.
  config      Json    @default("{}") @map("config")
  /// A paused server answers 503 rather than 404, so the caller can tell the
  /// difference between "switched off" and "never existed".
  isPaused    Boolean @default(false) @map("is_paused")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  workspace   Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  collections Collection[]
  endpoints   Endpoint[]

  @@index([workspaceId])
  @@map("mock_servers")
}

/// A folder. Self-referencing so an imported OpenAPI tag hierarchy nests to
/// whatever depth it arrived at — the one thing that cannot be retrofitted
/// without a data migration.
model Collection {
  id        String  @id @default(uuid()) @db.Uuid
  serverId  String  @map("server_id") @db.Uuid
  parentId  String? @map("parent_id") @db.Uuid
  name      String
  /// Materialised ancestor path (`/auth/admin`) for breadcrumbs and sorting
  /// without a recursive query.
  path      String
  sortOrder Int     @default(0) @map("sort_order")
  /// Collection-level defaults: auth, headers, base path.
  config    Json    @default("{}") @map("config")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  server    MockServer   @relation(fields: [serverId], references: [id], onDelete: Cascade)
  parent    Collection?  @relation("CollectionTree", fields: [parentId], references: [id], onDelete: Cascade)
  children  Collection[] @relation("CollectionTree")
  endpoints Endpoint[]

  @@index([serverId, path])
  @@index([parentId])
  @@map("collections")
}

/// One route and the graph that answers it. The graph lives here rather than in
/// a joined table because this row is the hot path: a public request reads it
/// once and nothing else.
model Endpoint {
  id           String  @id @default(uuid()) @db.Uuid
  serverId     String  @map("server_id") @db.Uuid
  collectionId String? @map("collection_id") @db.Uuid

  method      HttpMethod
  /// Normalised at write time: leading slash, no trailing slash, `:name` for
  /// parameters, a single trailing `*` for a wildcard tail.
  pathPattern String  @map("path_pattern")
  /// Both precomputed so candidate selection is one indexed query and ranking
  /// is arithmetic rather than parsing.
  segmentCount Int    @map("segment_count")
  specificity  Int
  hasWildcard  Boolean @default(false) @map("has_wildcard")

  name        String
  description String?
  isEnabled   Boolean @default(true) @map("is_enabled")

  /// GraphDocument. Carries its own `schemaVersion`.
  graph   Json @map("graph")
  /// Optimistic-concurrency token. Every save asserts the version it read.
  version Int  @default(1)

  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  server     MockServer  @relation(fields: [serverId], references: [id], onDelete: Cascade)
  collection Collection? @relation(fields: [collectionId], references: [id], onDelete: SetNull)

  @@unique([serverId, method, pathPattern])
  @@index([serverId, isEnabled, segmentCount])
  @@index([collectionId])
  @@map("endpoints")
}

/// Scope is one (type, id) pair rather than three nullable foreign keys.
/// Postgres treats NULLs as distinct, so a unique constraint over nullable
/// scope columns would not actually prevent duplicates.
model EnvironmentVariable {
  id          String        @id @default(uuid()) @db.Uuid
  workspaceId String        @map("workspace_id") @db.Uuid
  scopeType   VariableScope @map("scope_type")
  scopeId     String        @map("scope_id") @db.Uuid
  /// "default", "staging", … — one row per environment per key.
  environment String        @default("default")
  key         String
  value       String
  /// Masked in the UI and never written into a log line.
  isSecret    Boolean       @default(false) @map("is_secret")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([scopeType, scopeId, environment, key])
  @@index([workspaceId])
  @@map("environment_variables")
}

/// One row per public request. Capped and truncated — see §8.
model RequestLog {
  id          String  @id @default(uuid()) @db.Uuid
  workspaceId String  @map("workspace_id") @db.Uuid
  serverId    String  @map("server_id") @db.Uuid
  /// Null when nothing matched, which is exactly the case worth reading.
  endpointId  String? @map("endpoint_id") @db.Uuid

  method     String
  path       String
  status     Int
  durationMs Int    @map("duration_ms")

  /// { headers, query, bodyPreview, bodyTruncated } — redacted before write.
  request  Json  @map("request")
  /// { headers, bodyPreview, bodyTruncated }
  response Json  @map("response")
  /// Which nodes ran, in order, with per-node milliseconds. Powers the trace.
  trace    Json? @map("trace")

  createdAt DateTime @default(now()) @map("created_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, createdAt(sort: Desc)])
  @@index([serverId, createdAt(sort: Desc)])
  @@map("request_logs")
}

/// Workspace and server creation, metered per caller address. Same shape and
/// same reasoning as `port_scan_quota`: the row says how often somebody
/// created something and nothing about who.
model MockQuota {
  visitorHash String   @id @map("visitor_hash")
  count       Int      @default(0)
  windowStart DateTime @map("window_start")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([windowStart])
  @@map("mock_quota")
}
```

### 2.2 What is deliberately absent

`WorkspaceMember`, `EndpointVersion`, `Team`, `User`. All four are **purely
additive** — no existing column needs a backfill to introduce them, because
`Workspace` carries no `ownerId` and `Endpoint.graph` is a self-contained
document with its own `version`. Creating tables nothing writes to is dead
weight; the extensibility requirement is met by the absence of anything that
would block them.

The one thing that genuinely could not be retrofitted cheaply is
`Collection.parentId`, which is why it is there from the first migration.

---

## 3. Identity and ownership

No accounts. Two credentials, different jobs.

| Credential       | Lives in                                       | Purpose                                                                |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Workspace secret | HttpOnly, SameSite=Lax cookie `toolforge.mock` | Session — proves ownership on every studio action. **One per browser** |
| Recovery key     | Shown once, saved by the human                 | Bearer — adds a browser to a workspace that already exists             |

The cookie holds secrets joined by `.`, capped at **3**. The server hashes each
and looks up a row in `workspace_secrets`.

**A row per device, not a column on `workspaces`.** This changed during M0 and
the reason is worth keeping: with a single `secretHash` column, importing a
recovery key into a second browser would have to _overwrite_ it, silently
logging the first browser out. A recovery key whose use evicts you elsewhere is
not a recovery key. The row-per-claim version also makes "forget on this device"
a real, per-device revocation rather than a cookie edit.

Two operations, one click apart, and they must never be confused:

- **Forget** deletes this browser's `workspace_secrets` row. The workspace keeps
  running, its endpoints keep answering, other browsers keep access, and the
  recovery key still works.
- **Delete** removes the workspace and cascades to every server, endpoint,
  variable, log and claim under it, for everyone.

Because the cookie is HttpOnly, the client cannot enumerate it. The workspace
switcher is fed by a Server Action, not by `localStorage`.

Recovery key format: **Crockford base32, 4 groups of 4** — `8QXK-H72D-9FLC-4M2P`.
80 bits. Crockford excludes `I`, `L`, `O`, `U`, which kills both transcription
errors and accidental words. Stored as `sha256(key)`.

The cookie is a credential store, so — per the rule already in `CLAUDE.md` —
the UI says so, caps the list, and offers a button that empties it.

**"3 workspaces per browser" is a UI affordance, not a limit.** The real limit is
`MockQuota`, keyed on a salted hash of the caller's address, behind Turnstile.
Importing a recovery key does **not** spend creation quota, or "open it in
another browser" would be broken.

---

## 4. Public execution

### 4.1 Addressing

```
https://<site>/m/<serverKey>/<path>           ← what ships (Vercel default domain)
https://<serverKey>.mock.<site>/<path>        ← when a real domain exists
```

Both resolve to one file:

```
src/app/m/[serverKey]/[[...path]]/route.ts
```

The subdomain form, when it arrives, is a `NextResponse.rewrite` in
`src/proxy.ts` onto the path form. The host check runs **inside** the proxy
function, not in `config.matcher` — matcher values must be build-time constants
and the mock host would come from an environment variable.

Either way the proxy must short-circuit **before** `updateSession()`. Today's
matcher catches everything non-static, so without that every mock request would
pay for a Supabase session refresh and write a `Set-Cookie` onto a public API
response.

**What the path form gives up.** A subdomain isolates cookies, CSP and
reputation; a path on the main origin isolates none of them. Until a real domain
exists, the content-type allowlist in §4.3 is therefore not a nice-to-have — it
is the only thing stopping a mock endpoint from serving a phishing page under
this site's name. It is **default-deny with no per-server opt-in** while the
studio is path-hosted; the opt-in described below unlocks with the subdomain.

```ts
export async function proxy(request: NextRequest) {
    const rewrite = mockRewrite(request); // pure, tested
    if (rewrite) return NextResponse.rewrite(rewrite);
    return await updateSession(request);
}
```

`export const dynamic = "force-dynamic"` on the route, for the same reason
`/q/[slug]` carries it: a graph saved a second ago must be the one that answers.

### 4.2 Route matching

The part the brief did not mention and the part that is actually hard.

```
domain/match.ts     — pure, no I/O
```

1. Normalise the incoming path: strip trailing slash, split on `/`, percent-decode
   each segment once.
2. Query candidates by `(serverId, isEnabled, segmentCount)`, plus wildcard rows
   whose `segmentCount <= n`. **Select without `graph`** — twenty candidates at
   100 KB each is 2 MB of JSON for one answer.
3. Rank in-process. `specificity` is precomputed at write time as a base-3 number
   read left to right, one digit per segment: `2` static, `1` parameter, `0`
   wildcard. Higher wins; ties break on `pathPattern` ascending so the result
   cannot flip between deploys.
4. Method: if a path matched but no row carries the method, answer **405** with an
   `Allow` header listing the methods that do exist. Folding that into 404 is the
   most common bug in hosted mock servers.
5. Fetch `graph` for the winner by id — one `findUnique`.

Two queries, both indexed, both small.

### 4.3 Response envelope

Every mock response carries:

```
X-Robots-Tag: noindex, nofollow
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Security-Policy: sandbox
X-Mock-Endpoint: <endpointId>        (helps the trace view; opt-out per server)
```

Content-type policy is an allowlist — `application/json`, `text/plain`,
`application/xml`, `text/csv`. `text/html` and script types are refused.

While the studio is path-hosted on the main origin there is **no opt-in**: a
login form served from this site's own domain borrows this site's name outright.
Once execution moves to its own subdomain, the opt-in becomes available per
server behind an explicit warning, recorded in `MockServer.config` and shown in
the server header.

---

## 5. Graph engine

### 5.1 Document

```ts
type GraphDocument = {
    readonly schemaVersion: 1;
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
    readonly viewport?: { x: number; y: number; zoom: number };
};

type GraphNode = {
    readonly id: string;
    readonly kind: NodeKind;
    readonly position: { x: number; y: number };
    readonly data: NodeData; // discriminated on kind
};

type GraphEdge = {
    readonly id: string;
    readonly source: string;
    /** "next" | "true" | "false" | `case:${string}` | "default" | `branch:${string}` */
    readonly sourceHandle: string;
    readonly target: string;
};
```

`schemaVersion` plus a `migrateGraph(doc)` chain. An endpoint saved against
version 1 keeps executing after version 2 lands; migration happens on read and
is written back on the next save.

### 5.2 The eleven node kinds

| Kind           | Outputs                 | Data                                                             |
| -------------- | ----------------------- | ---------------------------------------------------------------- |
| `request`      | `next`                  | none — the entry anchor, exactly one per graph                   |
| `auth`         | `pass`, `fail`          | `{ mode: "none"\|"apiKey"\|"bearer"\|"basic"\|"jwt", config }`   |
| `condition`    | `true`, `false`         | `{ left: ValueExpr, op: CompareOp, right: ValueExpr }`           |
| `switch`       | `case:<id>…`, `default` | `{ operand: ValueExpr, cases: SwitchCase[] }`                    |
| `delay`        | `next`                  | `{ ms: number } \| { min: number, max: number }`                 |
| `randomBranch` | `branch:<id>…`          | `{ branches: { id, label, weight }[] }`                          |
| `setVariable`  | `next`                  | `{ name: string, value: ValueExpr }`                             |
| `transform`    | `next`                  | `{ source, target, ops: TransformOp[] }`                         |
| `log`          | `next`                  | `{ level, message: ValueExpr }`                                  |
| `httpRequest`  | `ok`, `error`           | milestone 8 — see §11                                            |
| `response`     | terminal                | `{ status, headers: HeaderRow[], contentType, body: ValueExpr }` |

`Build Response` and `Return Response` are **one node**. Two nodes admit a graph
that builds without returning, which is a state with no meaning.

### 5.3 Node registry — the plugin seam

Two registries keyed by the same `NodeKind` union.

```
domain/nodes/registry.ts        framework-free: schema, defaults, handles, execute
components/nodes/registry.tsx   client: icon, accent, node body, inspector panel
```

```ts
type NodeDefinition<D> = {
    readonly kind: NodeKind;
    readonly schema: ZodType<D>;
    readonly defaults: () => D;
    /** Dynamic — a switch has one handle per case. */
    readonly handles: (data: D) => readonly Handle[];
    readonly execute: (data: D, ctx: ExecutionContext) => NodeResult | Promise<NodeResult>;
};
```

Registering a node = widen the union, add one entry to each registry, add two
message keys per locale. Nothing else in the app changes.

### 5.4 `ValueExpr`

```ts
type ValueExpr =
    | { kind: "static"; value: JsonValue }
    | { kind: "request"; source: RequestSource; path: string }
    | { kind: "env"; key: string }
    | { kind: "var"; name: string }
    | { kind: "faker"; fn: FakerFnId; args?: JsonValue }
    | { kind: "uuid" }
    | { kind: "now"; format: TimeFormat }
    | { kind: "template"; parts: readonly (string | ValueExpr)[] }
    | { kind: "object"; fields: readonly ObjectField[] }
    | { kind: "array"; of: ValueExpr; count: CountExpr }
    | { kind: "oneOf"; options: readonly ValueExpr[] };
```

`RequestSource` is `"body" | "header" | "cookie" | "query" | "param"`. Those five
were separate canvas nodes in the brief; here they are one dropdown.

`FakerFnId` is a **curated literal union of ~40 ids**, not the whole Faker
surface. It has to be a union rather than a string so `faker.<id>.label` stays a
statically checked message key — the rule already in `CLAUDE.md`.

`template` is what replaces typed template syntax. The UI is a chip input:
literal text and value chips side by side, never `{{ }}`.

### 5.5 Validation at save

`validateGraph(doc)` returns typed problems, never throws:

- exactly one `request` node
- every node reachable from it
- every path terminates at a `response`
- no cycles in control flow
- every `sourceHandle` exists on its source node
- every `ValueExpr` within `MAX_VALUE_DEPTH`
- every `var` read has a `setVariable` upstream on **every** path that reaches it

The last one is the interesting check and the one a naive builder skips.

---

## 6. Execution engine

### 6.1 Context

```ts
type ExecutionContext = {
    readonly request: NormalizedRequest;
    readonly env: Readonly<Record<string, string>>;
    readonly random: SeededRandom;
    readonly clock: () => number;
    readonly sleep: (ms: number) => Promise<void>;
    readonly fetch: GuardedFetch; // milestone 8; a refusing stub before then
    readonly deadlineAt: number;
    vars: Record<string, JsonValue>;
    trace: TraceEntry[];
    steps: number;
};

type NodeResult =
    | { kind: "continue"; handle: string }
    | { kind: "respond"; response: MockResponse }
    | { kind: "error"; reason: ExecutionErrorReason; detail?: string };
```

Every source of nondeterminism is injected. `Date.now()`, `Math.random()` and
bare `fetch` appear nowhere in `domain/`.

### 6.2 Reproducibility, not determinism

The brief asked for deterministic execution while listing `Random`, `UUID`,
`Timestamp` and `Random Name` as nodes. Those cannot both hold. What is
achievable and worth having is **reproducibility**:

- context carries `seed`, defaulting to a hash of `(endpointId, requestId)`
- overridable by `?__seed=` or an `X-Mock-Seed` header
- one seeded PRNG (`sfc32`, ~15 lines, pure) drives Faker, `randomBranch`, UUID v4
  and delay jitter

Invariant, and the single most valuable test in the suite:

> same graph + same request + same seed → byte-identical response

### 6.3 Budgets

| Constant             | Value  | Why                                                                       |
| -------------------- | ------ | ------------------------------------------------------------------------- |
| `MAX_STEPS`          | 200    | Backstop behind save-time cycle detection                                 |
| `MAX_DELAY_MS`       | 5 000  | An uncapped delay is a cheap way to exhaust function concurrency          |
| `MAX_TOTAL_MS`       | 10 000 | Absolute deadline; whatever is unfinished reports as an error, not a hang |
| `MAX_RESPONSE_BYTES` | 1 MiB  |                                                                           |
| `MAX_ARRAY_ITEMS`    | 1 000  | Per `array` expression                                                    |
| `MAX_VALUE_DEPTH`    | 12     | Recursion guard on `ValueExpr`                                            |

### 6.4 One executor, two callers

```
executeGraph(graph, request, deps) → MockResponse
        ↑                                   ↑
  /m/… route handler              previewEndpoint Server Action
```

The preview in the studio calls the identical executor on the server. It is not a
browser reimplementation, so preview cannot disagree with production. This also
keeps `@faker-js/faker` — roughly 3 MB — out of the client bundle entirely, and
it is dynamically imported inside the resolver so a graph with no faker values
never loads it at all.

---

## 7. Application layer

### 7.1 Folder structure

```
src/modules/mock-server/
  actions/         "use server" — every studio mutation
  components/      studio UI, canvas, inspector, response builder
  domain/          pure: graph, executor, values, matching, quota, openapi
    nodes/         one file per node kind + registry.ts
    values/        resolve.ts, faker-registry.ts, providers.ts
  presenters/      server-only: domain data + translations → view models
  repository/      the only place Prisma is touched
  tests/           bun tests
  types/           literal unions — NodeKind, ValueKind, FakerFnId, …
  validation/      Zod schemas

src/app/mock/…                          studio routes
src/app/m/[serverKey]/[[...path]]/       public execution
```

### 7.2 Routes

| Route                                                   | What                                                    |
| ------------------------------------------------------- | ------------------------------------------------------- |
| `/mock`                                                 | Landing: workspace list, create, import by recovery key |
| `/mock/[workspaceId]`                                   | Overview, servers grid                                  |
| `/mock/[workspaceId]/servers/[serverId]`                | Endpoint tree, server settings                          |
| `/mock/[workspaceId]/servers/[serverId]/e/[endpointId]` | **The studio**                                          |
| `/mock/[workspaceId]/logs`                              | Searchable log table                                    |
| `/mock/[workspaceId]/environments`                      | Variables, per scope, per environment                   |
| `/mock/[workspaceId]/import`                            | OpenAPI upload and mapping preview                      |
| `/mock/[workspaceId]/settings`                          | Rename, recovery key, delete, forget-on-this-device     |

Every one gets a `loading.tsx` with skeletons matching the real layout.

### 7.3 API surface

Studio mutations are **Server Actions**, per `CLAUDE.md`. They are same-origin UI
interactions and get CSRF protection and end-to-end typing for free.

```
createWorkspace · importWorkspace · renameWorkspace · deleteWorkspace · forgetWorkspace
createServer · updateServer · pauseServer · deleteServer
createCollection · renameCollection · moveCollection · deleteCollection
createEndpoint · updateEndpointRoute · saveEndpointGraph · duplicateEndpoint · deleteEndpoint
setVariable · deleteVariable
previewEndpoint
importOpenApi · exportServer
clearLogs
```

Route Handlers are used **only** where the client is not this UI:

| Handler                       | Why it must be HTTP                                          |
| ----------------------------- | ------------------------------------------------------------ |
| `/m/[serverKey]/[[...path]]`  | The client is somebody else's program                        |
| `/api/v1/*` (later milestone) | Seeding mocks from CI; authenticated by `X-Workspace-Secret` |

The v1 REST layer stays a thin shell over the same `repository/` + `domain/`
functions the actions call, so it adds a transport and no logic.

### 7.4 Component hierarchy

```
StudioPage (server)
├─ StudioHeader (server)            method · path · public URL · save state
├─ ExplorerRail (client)            servers → collections → endpoints, drag to reorder
├─ StudioCanvas (client, dynamic)   ssr:false — React Flow touches window
│  ├─ NodePalette                   drag source, grouped by category
│  ├─ ReactFlow
│  │  ├─ GraphNodeShell             chrome, handles, selection ring
│  │  │  └─ <kind>NodeBody          from the client node registry
│  │  ├─ Background (grid) · MiniMap · Controls
│  ├─ CanvasToolbar                 auto-layout, zoom-to-fit, undo/redo
│  └─ ConflictBanner                shown on a version conflict
├─ InspectorPanel (client)
│  ├─ <kind>Inspector               from the client node registry
│  └─ ResponseBuilder               the tree editor
│     ├─ FieldRow                   key · type · ValuePicker · drag · collapse
│     └─ ValuePicker                provider dropdown → per-kind editor
└─ BottomDock (client)
   ├─ PreviewPanel                  runs previewEndpoint, shows real output
   ├─ RequestConsole                craft a test request
   └─ TracePanel                    node-by-node timing from the last run
```

The JSON escape hatch lives in `ResponseBuilder` as a second tab, two-way, built
on the existing `code-editor.tsx` and `highlight.ts`. Refusing one loses every
power user; _"almost never write JSON"_ is the goal, not _"never"_.

**What shipped, and one correction to the shape above.** The canvas is not a
panel inside the route form. It first shipped as one — a 26rem box under the
response editor, reached by a Response/Flow tab — and that was the wrong shape
for all three of its parts at once: the canvas had no room to lay a graph out,
the palette wrapped into three rows of chips, and the inspector, which for a
response node _is_ the whole tree editor, sat below the fold of a panel that was
itself below the fold of the page.

`GraphStudio` is now a full-screen dialog opened from the route form, three
panes filling the viewport — palette rail, canvas, inspector — stacking to one
scrolling column below `lg`. The rule it stands for: **a canvas editor takes the
viewport or it takes a door, never a slot in a form.** The dialog's own
`Save route` runs the same `save()` the form does and closes on success;
closing without saving keeps the edits in the store and the form shows an
_Unsaved changes_ chip, because the store outlives the dialog.

That last point cost a latent bug worth recording. The flag saying "the canvas
has been touched, read the graph from the store on save" was a boolean, and the
store is module-level — so dirtying one route's flow and then saving a
_different_ route would have written the first route's graph onto the second. It
is now the endpoint id (`flowDirtyFor`), compared against the open route. Any
flag that gates reading from a module-scoped store has to name _what_ it was
set for, not merely that it was set.

Five smaller rules the canvas settled once it had the room to be used properly:

- **A palette drops into the viewport, not into graph space.** The fixed drop
  point was correct until `fitView` panned — which it does on every open — after
  which every new node appeared off-screen and had to be hunted for and dragged
  back. `view` lives in the store because the palette sits outside the
  `<ReactFlow>` tree, and `dropPosition` inverts the transform in `domain/`,
  where it is tested. It also selects what it just added: the inspector is where
  a node is configured, so opening it is the next thing the reader was going to
  do anyway.
- **Clear keeps both ends.** `resetGraph` strips the logic and preserves the
  request and the response — including the response node's _data_, because that
  node carries the body the route form edits through the same field. Removing it
  would make a button labelled as clearing the _flow_ quietly clear the
  _response_. Confirmation lives in the toast rather than in an armed button, so
  the destructive press is never the one already under the pointer, and it goes
  through the temporal store so ⌘Z brings it all back.
- **A tree row in a rail is two lines, not one.** `ValueRow` laid identity, kind
  and value on a single flex row with a fixed 10rem key box. Fine in a
  full-width panel, unusable in a 22rem inspector: the row overflowed, the
  container grew a horizontal scrollbar and every control became a sliver. Key
  and row actions take the first line; the kind and its value get the whole of
  the second and wrap among themselves.
- **`type="number"` reserves the stepper's width inside the content box.** In
  anything narrow the arrows land on top of the value — a three-digit weight
  rendered as two digits and a spinner. The `no-spinner` utility exists for that
  case only; where the field is wide the arrows are a real affordance.
- **Vendor CSS with `__` in its selectors belongs in a stylesheet.** React Flow's
  chrome is light-only and had to be repainted from tokens. An arbitrary variant
  cannot express it safely: `_` means a space inside one, so the class needs
  escaped underscores, which then behave differently in a JSX attribute
  (backslashes stay literal) and in a `cn()` argument (a JS string collapses
  `\_` to `_`) — one of the two silently generates a rule that matches nothing.
  The `.mock-canvas` block in `globals.css` needs no `!important` either, because
  two classes outrank one whatever order the sheets land in.

### 7.5 Pausing a server

`MockServer.isPaused` shipped in M1 and `serveMockRequest` has refused a paused
server ever since. Nothing could set it until now, which made it a column rather
than a feature.

**503, never 404.** A 404 says "this address is wrong" and sends the caller off
to check their URL; 503 says "this exists and is not answering", which is true
and is what lets somebody stop debugging their own code. That distinction is the
reason the state is worth having at all, and it is why the copy on both surfaces
names the status code rather than only the state.

**The off state repaints the frame, not a badge.** The workspace card and the
server page both go amber and both say what the routes now answer with. Somebody
who paused a server yesterday and meets failing calls today has to be able to
learn why from the page rather than from a response body. The live state gets a
dot rather than a play glyph — it is a condition, not a button to press.

**Pausing is not deleting, and the copy says so.** Endpoints, logs and variables
survive untouched; that is the whole difference from the button beside it.
`pauseServerSchema` carries the id and the boolean and nothing else, because
`updateServerSchema` requires a name — and a toggle that round-trips a field it
is not editing is a toggle that reverts a rename made in another tab. Every field
on `UpdateServerRow` became optional for the same reason.

### 7.6 State management

Zustand with selector subscriptions. **Not** React Context — the graph changes on
every drag frame and context re-renders every consumer. `reactCompiler` is on and
helps with memoisation, but does not fix context fan-out.

```ts
useStudioStore = create(temporal(immer(…)), {
    // `viewport` and `selection` are excluded from temporal state, or panning
    // fills the undo stack and Ctrl+Z scrolls instead of undoing.
    partialize: ({ nodes, edges }) => ({ nodes, edges }),
    limit: 100,
});
```

`zundo` gives undo/redo. Copy/paste is a store action over a `GraphFragment`
(nodes plus internal edges, ids remapped on paste). Auto-layout is
`@dagrejs/dagre` — small, and sufficient for DAGs. `elkjs` is 1.5 MB and buys
nothing here.

### 7.7 Autosave and optimistic concurrency

Debounced 800 ms, whole document. Graphs are under 100 KB; diffing is not worth
the complexity yet.

```ts
const updated = await prisma.endpoint.updateMany({
    where: { id, version },
    data: { graph, version: { increment: 1 } },
});
if (updated.count === 0) return { ok: false, reason: "version_conflict" };
```

Zero rows updated means another tab saved first. The UI shows a conflict banner
offering _reload theirs_ or _overwrite with mine_. **Never last-write-wins** — two
studio tabs is the normal case, not the edge case.

Optimistic UI: the store applies every edit immediately and tracks
`saveState: "idle" | "dirty" | "saving" | "saved" | "conflict"`. Nothing in the
canvas ever waits on a round trip.

---

## 8. Logs

Written with `after()` from `next/server`, so logging never delays the mock
response. Confirmed available in Route Handlers in the bundled Next 16 docs.

- **Cap 500 rows per workspace.** Trim runs probabilistically (1 in 20 writes) to
  keep the hot path cheap, plus a TTL sweep at 7 days.
- **Truncate bodies at 8 KB**, with an explicit `bodyTruncated` flag rather than a
  silent cut.
- **Redact `authorization`, `cookie`, `x-api-key`, `proxy-authorization` by
  default.** People post real bearer tokens at their mocks. Raw capture is
  opt-in per server and says what it means.
- Variables marked `isSecret` never reach a log line or a trace entry.

---

## 9. Performance and caching

- Candidate query excludes `graph`; the winner's graph is a second `findUnique`.
- No execution cache in v1 — two indexed queries is roughly 2 ms and correctness
  beats it. A later milestone can add `unstable_cache` keyed on `serverId` with
  `revalidateTag(\`mock:server:${id}\`)`on every save. The trap is stale graphs
after a save, which is why the route carries`force-dynamic` until then.
- React Flow: `onlyRenderVisibleElements` above ~150 nodes.
- Canvas is `next/dynamic` with `ssr: false` and a skeleton matching its layout.
  React Flow is client-only and must never enter the shared bundle the other 28
  tools pay for.
- `@faker-js/faker` and `@apidevtools/swagger-parser` are server-only and lazily
  imported inside the functions that need them.

---

## 10. Errors and validation

Typed results throughout — `throw` is reserved for programmer error.

```ts
type ExecutionErrorReason =
    | "no_entry_node"
    | "no_response_on_path"
    | "step_budget_exceeded"
    | "deadline_exceeded"
    | "value_depth_exceeded"
    | "response_too_large"
    | "auth_failed"
    | "outbound_blocked"
    | "graph_invalid";
```

Each maps to a status and a small JSON body plus an `X-Mock-Error` header, so a
caller debugging their integration gets a machine-readable reason rather than a
stack trace. Unexpected failures go through `logEvent`; `console.*` appears
nowhere.

Zod covers node data, the whole `GraphDocument`, every action payload, and search
params (`.catch(undefined)` per field, so a malformed link opens on defaults).

---

## 11. Security

The four gates, ordered by what each one costs — cheapest refusal first, the
same ordering the Port Scanner uses.

1. **Shape and syntax**, local and free: path pattern, method, server key.
2. **Ownership**: secret cookie hashed and matched. Every action, no exceptions.
3. **Turnstile**: workspace and server creation.
4. **Quota**: `MockQuota`, salted-hash keyed, in Postgres, **fails closed**. No
   `DATABASE_URL` or no salt means creation is refused rather than unmetered.

### Throughput on the public path

The three gates above all guard _the studio_. `/m/<key>/…` has none of them —
there is no cookie, no challenge and no account, because the whole point is that
somebody else's program can call it. It therefore carries its own limit, and it
is a different shape from the other two.

**What it defends against is a loop, not an attacker.** A `useEffect` with a
dependency that changes every render calls its mock as fast as the network
allows, from one tab, until the tab is closed. That is the single most likely
way this deployment gets hurt, and it is an accident rather than an attack —
which decides almost every parameter:

| Choice                                                        | Why                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One-minute window**, not the hourly one used elsewhere      | The author fixes the loop in seconds and expects their mock back. An hourly window outlives the mistake by an hour. It also bounds the hour anyway: 120/min is 7,200/hr                                                     |
| **120 per calling address**                                   | Two a second sustained. A test suite, a hot-reloading front end and a Postman run all sit well under it; a render loop does not                                                                                             |
| **1,200 per server key**                                      | Ten times the per-address bound, so a team or a CI fleet is never refused by the shared limit before the per-caller one bites — and a flood spread across many addresses still meets a ceiling                              |
| **One `INSERT … ON CONFLICT … RETURNING`**, not a transaction | This is the hot path. A read-then-write transaction would double the database work of _every_ request including every request in a flood, and a limiter that gets more expensive the harder it is pushed is the wrong shape |
| **Counted before serving, logged never**                      | A refused request reaches no server lookup, no route match, no graph and no log row. A loop that filled the 500-row request log with its own refusals would push out the calls its author needs to see                      |
| **Both counters in one statement**                            | Two rows in one `VALUES`, which is safe here precisely because the two keys are digests of different namespaces and so can never collide — the one thing Postgres refuses to do with `ON CONFLICT`                          |
| **Fails closed**                                              | Same reasoning as creation, and in practice the two failures coincide: the database this cannot reach is the one `serveMockRequest` needs to find an endpoint at all                                                        |

Two smaller decisions worth having written down.

**`HEAD` and `OPTIONS` are counted.** A browser sends a preflight before each
cross-origin call, so counting them halves that caller's effective budget. Taken
deliberately: the alternative is a verb that reaches the database unmetered.

**`repository/rate-limit.ts` keeps an in-memory map, and it is not the limit.**
`CLAUDE.md` is explicit that a per-process counter is a limit in name only, and
that rule stands — the counters are rows. What the map holds is a _refusal
already learned from Postgres_: "this key is over until T". Within one window a
count only goes up, so no instance can be under before T, which makes the cache
exact rather than merely conservative, and losing it on a cold start costs one
round trip. It exists for the loop specifically: without it, each of a runaway's
thousands of refusals still costs a database write. With it they cost a `Map`
lookup. The distinction to hold on to is that a cached _refusal_ can only ever
refuse more, never less — which is why this is safe where a cached _count_ would
not be.

The rows are keyed by digest and reset in place, so the table is bounded by
distinct callers rather than by requests. `sweepQuotaRows` drops anything a day
past its window, called from `after()` and only when a fresh window opened — at
most once a minute per active server, off the response path. A sweep is not a
limiter: running it too often is merely wasteful and missing one is caught by
the next request, so unlike a counter it is safe to trigger from whichever
process happens to notice.

### Origin isolation

Mock responses are served from `<key>.mock.<site>`, never from the main origin.
That isolates cookies, CSP and reputation. The content-type allowlist still
applies, because a subdomain still carries this site's name.

### Outbound nodes — milestone 8, and not before

`httpRequest` and `webhook` let a stranger's graph make this server open
connections to addresses they choose. Untreated, that is server-side request
forgery — a graph fetching `http://169.254.169.254/` reads cloud metadata
credentials — and it is an amplifier, since ten thousand requests to a mock
become ten thousand requests to a third party carrying this server's address.

They ship only with all of the following:

- `guardAddresses()` from `tools/repository/address-guard.ts` on every hop,
  redirects included, connecting to the address that was checked rather than
  re-resolving the name
- a hard cap on outbound calls per execution
- a per-workspace outbound quota in Postgres that fails closed
- short connect and read timeouts, and a response size cap
- `http:`/`https:` only, no redirect chains past a fixed depth

### Secrets

`EnvironmentVariable.isSecret` masks a value in the UI and keeps it out of logs
and traces. The copy says plainly that a mock server is not a secret store.

---

## 12. Testing strategy

Everything below runs in `bun test` against `domain/`.

| Area           | What is asserted                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `match.ts`     | Specificity ordering, `/users/me` beating `/users/:id`, wildcards, 404 vs 405, trailing slash, percent-decoding |
| `resolve.ts`   | Every `ValueExpr` kind, depth cap, array cap, missing paths degrading rather than throwing                      |
| `executor.ts`  | Every node kind with fake clock, fake random, refusing fetch; every budget; every error reason                  |
| Seed invariant | Same graph + request + seed → identical bytes, across every node kind                                           |
| `validate.ts`  | Each rule in §5.5, including the unreachable-variable check                                                     |
| `migrate.ts`   | Every schema version migrates forward and still executes                                                        |
| `quota.ts`     | Window arithmetic, mirroring the port-scanner tests                                                             |
| `openapi.ts`   | Spec → graph, `$ref`, `allOf`, circular refs hitting the depth cap                                              |

### The independent check

Following the rule already in `CLAUDE.md` — _verify against something that is not
you_:

**OpenAPI spec → import → execute → validate the produced response against that
same spec's response schema, using `ajv`.** A wrong value provider, a wrong array
shape, or a wrong content type fails against a validator that shares no code with
the generator. Fixture specs: Petstore, Stripe's public spec, and a hand-written
adversarial one.

Second check: `graph → export OpenAPI → import → graph`, compared **at the model**
rather than byte-wise, because two spellings of the same route are equal.

---

## 13. Internationalisation

Roughly 250 new keys: 11 node kinds (name, description, per-field labels),
~40 Faker ids, inspector copy, empty states, error reasons. Both `en.json` and
`bn.json`, key for key.

User-authored content — workspace names, endpoint paths, header keys, variable
values — is never translated and never routed through `next-intl`.

Counts that read as prose go through `useFormatter().number()`. Endpoint paths,
status codes, and log row indices keep Western digits, because they mirror
machine input.

---

## 14. Milestones

Each is independently shippable and leaves the product working.

| #            | Milestone          | Ships                                                                                                                                                                                                        |
| ------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M0** ✅    | Foundation         | Schema, migration, workspace identity, cookie, recovery key, quota, `/mock` landing, nav entry                                                                                                               |
| **M1** ✅    | Servers and routes | Servers, endpoints, static JSON responses, **public execution live at `/m/<key>/…`**, specificity-ranked route matching, 404/405/OPTIONS, HEAD-via-GET                                                       |
| **M2** ✅    | Response Builder   | The tree editor, all 11 `ValueExpr` kinds, 51 curated Faker providers, seeded PRNG, honest JSON escape-hatch tab                                                                                             |
| **M3** ✅    | The Studio         | React Flow canvas, two-part node registry, undo/redo, copy/paste, duplicate, auto-layout, keyboard shortcuts, one save path shared with the response form                                                    |
| **Deferred** | Collections        | The `collections` table, its self-referencing tree and the variable scope all exist; the folder UI does not. Endpoints currently sit at a server's root                                                      |
| **M4** ✅    | Logic nodes        | `auth`, `condition`, `switch`, `delay`, `randomBranch`, `setVariable`, `log`, plus an inspector for each. `transform` is declared and deliberately unimplemented — the Response Builder already expresses it |
| **M5** ✅    | Logs and trace     | Searchable table, write-path redaction, 500-row and 7-day retention, per-node trace, `after()` so logging never delays a response                                                                            |
| **M6** ✅    | Environments       | Workspace/server/collection scopes with narrowest-wins, named environments, secrets masked before they cross the action boundary                                                                             |
| **M7** ✅    | OpenAPI            | JSON and YAML import, internal `$ref` resolution, schema-to-example mapping, a skipped-operations report, and export back to OpenAPI 3.1                                                                     |
| **M8** ✅    | Outbound           | `httpRequest` behind `guardAddresses`, resolve-then-connect, per-hop redirect guarding, streaming size cap, and a fail-closed per-workspace quota                                                            |

**M1 is the one that matters most.** It ships a working, publicly-callable mock
server before a single canvas node exists. Everything after it is an upgrade to
how the response is built, not a prerequisite for the product being useful.

---

## 15. Dependencies to add

| Package                       | Where                  | Licence |
| ----------------------------- | ---------------------- | ------- |
| `@xyflow/react`               | Client, dynamic import | MIT     |
| `zustand`, `zundo`            | Client                 | MIT     |
| `@dagrejs/dagre`              | Client                 | MIT     |
| `@faker-js/faker`             | Server only, lazy      | MIT     |
| `@apidevtools/swagger-parser` | Server only, M7        | MIT     |
| `yaml`                        | Server, M7             | ISC     |
| `ajv`                         | devDependency, tests   | MIT     |

Reused, nothing added: `zod`, `prisma`, `pg`, Turnstile, `address-guard`,
`logEvent`, `code-editor`, `highlight`, `scan-radar`, `use-result-scroll`.

**Supabase has no role here.** `CLAUDE.md` restricts it to Auth, Storage and
Realtime; this feature has no accounts and no files. It stays unused until
real-time collaboration is on the table.

---

## 16. Documentation owed

Per the _Documentation Is Part of the Change_ rule, landing this touches:

- `README.md` — Tools table row, environment table, project-structure block,
  and the "everything runs in the browser" promise line, which must name its
  exceptions
- `example.env` — `NEXT_PUBLIC_MOCK_ORIGIN_TEMPLATE`, `MOCK_IP_SALT`, and what
  degrades when each is blank
- `CONTRIBUTING.md` — the node registry, since adding a node is a contributor
  workflow
- `CLAUDE.md` — the two-tier node model and the route-matching rules, both of
  which the next author would otherwise redesign
- This file, kept current as milestones land
