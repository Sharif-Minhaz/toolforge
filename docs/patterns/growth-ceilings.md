# A Ceiling Somebody Can Come Back From

For any tool that stores something a stranger can grow. Anchored in
`json-server/domain/constants.ts`, which holds **two** size limits.

---

## Two numbers, not one

- `MAX_UPLOAD_BYTES` (900 KB) bounds what may be pasted in.
- `MAX_DOCUMENT_BYTES` (1 MB) is where writes stop.

The gap between them is the design rather than an accident: **a resource created
at its own ceiling is full before its first use.** Were the two numbers equal, the
first thing a visitor met after creating a server would be a refusal. The gap is
the room to actually use the thing.

## Leave a way out, and make sure it is a way out of the thing that is stuck

`isGrowingMethod` refuses `POST`, `PUT` and `PATCH` at the ceiling and
deliberately lets `DELETE` through, so a full server can always be emptied by the
person who filled it.

A limit that refused every write would be a trap whose only escape is discarding
the whole document — and the difference is one line in a set of methods, which is
precisely why it is easy to get wrong.

## Warn before you lock

A limit somebody meets with no notice reads as a fault in the tool.
`DOCUMENT_WARN_RATIO` turns the usage bar amber at 80% and the copy names the
remaining bytes, so the lock is something they saw coming.

And when it does lock, the copy says **which** methods stopped and **what to do**
— "full" alone leaves somebody with a service they believe is broken.

---

## Two mechanics worth copying

- **The gate reads a stored `sizeBytes` column** rather than measuring the
  document, so guarding a write costs a column and not a serialisation of the
  megabyte being guarded.
- **The gate lives in the pure engine, not in the repository**, so "what happens
  at the ceiling" is one branch covered by the same unit tests as every other
  route rather than something only reachable with a database.

---

## Related

- [`input-limits.md`](input-limits.md) — the ceiling on a single field, and why a
  content box is never capped with `maxLength`.
- [`../case-studies/json-server.md`](../case-studies/json-server.md) and
  [`../case-studies/graphql-server.md`](../case-studies/graphql-server.md) — the
  two studios that share the document and therefore these limits.
