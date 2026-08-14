# Watermark Remover — Calling a Metered Worker

`src/modules/watermark-remover/`, and every other tool that fronts a Workers AI
model (`ai-image-detector`, `ai-text-detector`, and the image half of
`equation`).

Every one of them reads its endpoint and bearer key in `repository/`, on the
server, and never from the browser. Two consequences fall out of that, both found
here.

---

## A per-IP limit upstream becomes a per-deployment limit here

The worker sees this server's address in `CF-Connecting-IP`, not the visitor's, so
a "five uploads a minute per IP" rule is **five a minute for the whole site.**

Setting `X-Forwarded-For` does not help — Cloudflare's own header wins.

Either have the worker prefer a forwarded-IP header from a trusted caller, or say
plainly in the copy that the limit is shared. **Never describe an upstream
per-connection limit as if it were per visitor.**

## Send the smallest thing that answers the question

The Watermark Remover crops the square around the mask in the browser, sends that
at the model's own 512 px, and composites the reply back onto the full-resolution
original through the same strokes.

The upload is smaller, the model works at near-native detail, and **every pixel
the reader did not mark is still theirs.**

Reach for the same shape before uploading a whole file: the browser has a canvas,
and `domain/` may hold that glue as long as the arithmetic around it stays pure
and tested — `watermark-remover/domain/region.ts` is the geometry, `canvas.ts` the
glue.

---

## The one place a raw colour literal is correct

A canvas paint colour sits over the reader's photograph, not over a themed
surface, so no token applies. **Say so in a comment where you write it.**

---

## Related

- [`../patterns/outbound-requests.md`](../patterns/outbound-requests.md#part-two-a-service-we-own)
- [`../design-system.md`](../design-system.md#tokens)
- [`image-codecs.md`](image-codecs.md) — the shared image layer this decodes
  through.
