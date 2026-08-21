# Hydration and Platform Pitfalls

Some platform behaviours look pure and are not. They all break in the same way:
the server render and the hydration pass disagree, so the page flickers or
throws.

The general rule: **generate per-request values on the server and pass them down
as props.** Never generate them in a `useState` initialiser — server and client
produce different values and hydration breaks.

The traps below are the specific ways that rule gets broken by code that looks
innocent.

---

## Never `new Date(string)` on a value that carries no offset

`new Date("2026-07-29T12:00:00")` is parsed against the _host's_ zone. On the
server that is the container's `TZ`, in the browser it is the reader's — the same
string becomes two different instants.

Parse the fields yourself and apply an explicit zone. See
`timestamp/domain/parse.ts`; `tools/domain/zone.ts` holds the wall-clock ↔
instant arithmetic, built on `Intl` alone, and is shared by every tool that needs
it.

Found building the Timestamp tool.

---

## Never build an option list from a runtime enumeration

`Intl.supportedValuesOf("timeZone")` returns 419 entries in Bun and 418 in Node,
and browsers differ again. A `<Select>` populated from it renders different
options on each side of hydration.

Freeze the list into a literal array in `domain/` (`tools/domain/time-zone-list.ts`)
and catch the difference where the value is _used_ — `isFormattableTimeZone`
probes by doing the thing, and the orchestrator drops what the local engine
cannot render and says which.

The same applies to `Intl.supportedValuesOf` for calendars, collations and
currencies, and to `TextDecoder` labels.

`Intl.DisplayNames` is the same family — see the country-name exemption and its
boundary in [`internationalization.md`](internationalization.md#country-names).

---

## A `datetime-local` value has no offset either

It is a wall clock and nothing more, so it means a different instant depending on
who reads it.

Parse the fields with a regex — never `new Date(value)` — and hand them to
`zonedFieldsToEpochMs` with a zone read **inside an event handler**, where there
is only one host to ask. `tools/domain/local-datetime.ts` does both directions
and rejects a rolled-over field rather than letting the arithmetic absorb it.

Where a stored instant has to _prefill_ such a field, derive it during render
behind `useIsHydrated()` — UTC on the server and through hydration, the reader's
own zone a tick later — never from an effect.

`tools/components/date-time-picker.tsx` is the control that speaks that string,
and it is the shape to copy. Its trigger label is formatted from `Date.UTC`
fields **in UTC**, so the typed wall clock renders identically on any host; the
calendar itself — which reasons in local date components and marks the host's own
"today" — lives inside the popover, so it never mounts during SSR and hydration
never sees it.

---

## An engine's error message is host-derived

`JSON.parse` says `Unexpected token '}' … at position 7` on V8 and
`JSON Parse error: Unexpected token '}'` on JavaScriptCore. Putting either in the
output makes the server pass and the hydration pass disagree — the same trap as
`Intl.supportedValuesOf`, arriving from a direction that looks nothing like it.

So `bson/domain/json-codec.ts` returns a typed `invalid_json` and nothing else,
and the copy points at the JSON Formatter, which owns a hand-written parser and
can name the line.

`ToonDecodeError` is safe to render for the mirror reason: it comes from a pinned
dependency, not from the host.

See [`case-studies/bson.md`](case-studies/bson.md).

---

## What *is* safe to call during render

`new URL()` is the rare platform API that is safe on both sides of hydration — it
is specified rather than host-derived, unlike the enumerations and zone-less
dates above.

What it _is_ is normalising: lowercased scheme and host, punycoded IDN, default
port dropped, empty path written as `/`. **Tell the reader when that changed
their text** instead of swapping it silently. See
[`patterns/derived-state-editors.md`](patterns/derived-state-editors.md).

---

## Reading browser storage without a mismatch

`useSyncExternalStore` with a separate server snapshot, not state seeded from an
effect. See
[`patterns/browser-persistence.md`](patterns/browser-persistence.md) for the
three parts and the stable-reference trap that spins React forever.

---

## Client-only libraries

A library that touches `window` on evaluation must be imported **inside the
effect that uses it**, never at module top level — a static import both breaks
the server render and lands in the island's first chunk for every reader,
including the ones who never see the feature. Leaflet (~150 KB) is the worked
example: [`patterns/maps.md`](patterns/maps.md).

---

## A library's `browser` field is a second implementation

A package with a `browser` field in its `package.json` ships **two builds**, and
a bundler picks one without telling anybody. This has now bitten three
dependencies here, each a little worse than the last:

| Library    | What differs                                       | How it fails                                                |
| ---------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `turndown` | which DOM it parses with                            | Silently, until something is converted. See [`case-studies/html-markdown.md`](case-studies/html-markdown.md). |
| `mammoth`  | **which argument key it accepts** — `arrayBuffer` in the browser, `buffer` on the server | `Could not find file in options`, which names neither build. |
| `pdfmake`  | `addVirtualFileSystem` exists only on the browser build | `is not a function`, at the moment a font is registered.     |

Three rules, in the order they are worth trying:

1. **Find the call that works on both.** pdfmake's `virtualfs.writeFileSync` is
   on the shared base class, so naming it instead of the browser-only wrapper
   removed the question entirely.
2. **Otherwise, satisfy both at once.** Mammoth takes `{ arrayBuffer, buffer }`
   happily; each build reads the key it knows. The published type is a union
   that cannot say "both", which is a fact about the types rather than about the
   library.
3. **Only then, avoid the ambiguous call site.** The HTML / Markdown converter
   converts on the server and passes the result down, so the island never asks
   the question during its server-rendered pass.

Note the case that is *not* a problem: a module resolved differently in the
browser and in `bun test` is fine as long as both behave identically — probe
both and say so in a comment. The failure is a difference nobody checked.

---

## The checklist

Before shipping a client component, ask:

```
Does anything in this render read the host?
├─ A date parsed from a string with no offset          → fix per §1
├─ A list from Intl.supportedValuesOf / TextDecoder    → fix per §2
├─ A datetime-local value                              → fix per §3
├─ An engine's thrown message                          → fix per §4
├─ localStorage / sessionStorage                       → useSyncExternalStore
├─ A library that touches window on import             → import inside the effect
└─ None of the above                                   → safe to derive in render
```
