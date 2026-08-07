# QR Encoder — The First Cross-Check

`src/modules/qr/`. Read before touching the encoder, the block tables, or the
placement loop.

---

## The defect

The placement loop skipped the timing column **by one column too few**, and every
structural assertion written about it passed. A generator that also owns its own
tests proves nothing: a wrong entry in a table, or an off-by-one in an
interleaver, still produces output that looks exactly like the real thing —
self-consistent, plausible, and unreadable by anything else.

## What caught it

A **round trip through an independent implementation**. The matrix is rasterised
into an RGBA buffer by a pure function and handed to `jsqr` — the same decoder the
reader half of the tool already uses.

One test per version and error-correction level, so every row of the block tables
and every alignment-pattern layout is actually exercised rather than assumed.

## Two things that made the failure legible once it appeared

- **Test the whole domain, not a sample.** The bug only broke three of the 160
  version/level pairs — the ones with a single error-correction block and the
  least parity. A handful of hand-picked payloads would have shipped it.
- **When output decodes on some inputs and not others, suspect placement before
  arithmetic.** Higher error-correction levels were masking a systematic
  corruption; the levels that failed were simply the ones with no redundancy left
  to spend on it.

---

## The generalised rule

Reach for the same shape whenever a tool emits a format somebody else has to read:
**encode, decode with a different implementation, assert you got back what you put
in.** The doctrine and its five instances:
[`../testing.md`](../testing.md#verifying-against-something-that-is-not-you).

Dynamic QR codes are short links behind a slug — see
[`short-links.md`](short-links.md).
