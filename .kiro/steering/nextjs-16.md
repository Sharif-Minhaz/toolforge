---
inclusion: always
---

# This is NOT the Next.js you know

This project runs **Next.js 16**. It has breaking changes — APIs, conventions, and file
structure may all differ from what a model was trained on.

Read the relevant guide in `node_modules/next/dist/docs/` **before** writing any route,
layout, metadata, caching, or config code. Heed deprecation notices.

Do not infer Next.js behaviour from memory. Check the local docs.

## Things that already bit us here

- There is **no `[locale]` route segment**. Locale comes from the `toolforge.locale`
  cookie. Tool routes stay canonical: `/tools/uuid`, never `/en/tools/uuid`.
- Because the root layout reads cookies, every route renders dynamically. That is
  intentional — it is what lets tool pages server-render a fresh result per request.
- `motion/react` is client-only. `motion/react-client` is **not** a server-side escape
  hatch — see the `design-system` steering doc.
