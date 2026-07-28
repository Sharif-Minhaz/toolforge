# Pitfalls

Each of these cost real time while building the UUID and Base64 tools. They are ordered by
how expensive they are to discover late.

---

## 1. A Web API is not the same in Bun, Node, and the browser

`bun test` is not a browser. Bun's `TextDecoder` ships **4** encoding labels; Node and
browsers ship all 19. A feature can be fully correct in production and still fail — or
worse, silently pass — under `bun test`.

Before relying on any platform API in `domain/`, probe all three runtimes:

```bash
node -e 'try { new TextDecoder("koi8-r"); console.log("node ok") } catch { console.log("node missing") }'
bun -e  'try { new TextDecoder("koi8-r"); console.log("bun ok")  } catch { console.log("bun missing")  }'
```

When they disagree:

1. Add a **cached capability probe** in the domain layer and return a typed failure
   (`unsupported_charset`) instead of letting a constructor throw mid-conversion.
2. Probe by **doing the thing**, not by reading a property. Bun's `utf-16be` decoder works
   correctly but reports `encoding: ""`, so a `.encoding` check declares a working decoder
   broken.
3. Write the test to assert real behaviour where the runtime supports it and the documented
   degradation where it does not, so it is meaningful in both:

```ts
const result = textToBytes(character, charset);

if (!isCharsetSupported(charset)) {
    expect(result).toEqual({ ok: false, reason: "unsupported_charset" });
    return;
}

expect(result).toEqual({ ok: true, bytes: new Uint8Array([byte]) });
```

4. Verify the full matrix on Node with a throwaway script, and **say in the handoff which
   parts `bun test` could not reach**:

```bash
cp /tmp/.../matrix.ts ./matrix.scratch.ts && npx tsx ./matrix.scratch.ts; rm ./matrix.scratch.ts
```

Do not keep the scratch file. `tsx` needs the file inside the project for `@/` to resolve.

## 2. An intermittent test failure is a bug report

A test that fails once in twenty runs and passes on a rerun is not noise to be waited out.
It usually means module-level mutable state plus a real clock, and the failing run is the
one telling the truth.

The UUID v7 generator kept its counter and last-used millisecond in a module singleton.
Overflowing the 12-bit counter borrows a millisecond from the future, which leaves the
generator's timestamp *ahead* of `Date.now()`. Every id after that took the "clock moved"
branch, which reseeded the counter **randomly** while the timestamp stayed put — so an id
could land with a smaller counter than its predecessor and sort before it. It surfaced as
one failure in twenty-one runs of the "strictly ascending" test.

When a test flakes:

1. Do not rerun until it is green. Find the shared mutable state and the time source.
2. Reproduce deterministically by injecting the clock — `generateUuid(7, frozen)` — instead
   of waiting for the race.
3. Prove the test catches the bug: revert the fix, watch it fail, restore the fix.
4. Reseed randomness only on a genuine forward tick. `Math.max(now, last)` keeps the
   timestamp safe but says nothing about the counter underneath it.

## 3. Your test data is not a source of truth

That Node matrix run caught a wrong byte in a hand-written test: `Ж` is `0x86` in CP866, not
`0x96`. The test passed anyway, because Bun lacks IBM866 and took the degradation branch.

Verify magic constants — code-page bytes, format vectors, epoch offsets — against the
runtime or the spec, not from memory. Prefer published vectors (RFC 4648's `f`/`fo`/`foo`
ladder) over invented ones.

## 4. Hydration

- Never generate a value in a `useState` initialiser. Random or time-based values differ
  between the server pass and the client, and hydration breaks. Generate on the server, pass
  as props.
- A pure derivation during render is safe and preferred — the SSR pass already contains the
  result, so the first paint is not empty.
- Server and client must render the **same option lists**. Never filter a `<Select>` by a
  runtime capability probe; keep the list static and fail at conversion time instead.
- **A runtime enumeration is a capability probe wearing a disguise.**
  `Intl.supportedValuesOf("timeZone")` returns 419 entries in Bun and 418 in Node, and
  browsers differ again — so a picker built from it renders different options on each side of
  hydration. Freeze the list into a literal array in `domain/` and absorb the difference where
  the value is used: probe by *doing the thing*
  (`isFormattableTimeZone` calls `format` in a `try`), drop what fails, and tell the reader
  what was dropped. `Intl.supportedValuesOf` for calendars, collations and currencies has the
  same problem.
- **`new Date(string)` reads the host's zone.** `new Date("2026-07-29T12:00:00")` — no
  offset — is parsed against `process.env.TZ` on the server and the reader's zone in the
  browser, so the same string becomes two different instants. Tokenise the fields yourself
  and apply an explicit zone. Strings that *do* carry an offset (`Z`, `+06:00`, `GMT`) are
  safe, but it is easier to have one code path than to remember which is which.
- Anything the server genuinely cannot know — the reader's zone, their theme — goes behind
  `useIsHydrated()`, with a fixed fallback for the server pass. Reading `Intl` or
  `localStorage` during render is the same bug as generating in a `useState` initialiser.

## 5. Debounce, and what not to debounce

Recomputing per keystroke re-runs the whole conversion and re-renders the whole result for
every intermediate string. Use `useDebouncedValue` (300 ms) for typed values.

Two different shapes, one per architecture — do not mix them:

- **Derived during render** → `useDebouncedValue(text)`, then derive from the settled value.
- **Event-driven side effect** (a random generation that cannot be derived) → a
  `setTimeout` in a ref, cancelled by every immediate path, cleared on unmount. Doing this in
  an effect would trip `react-hooks/set-state-in-effect`.

Count sizes and stats from the **settled** value too, or the counter and the output disagree
by a keystroke. Dim the stale result (`opacity-55`); never blank it.

## 6. Typed failures beat exceptions

```ts
export type Failure = {
    readonly ok: false;
    readonly reason: "invalid_character" | "invalid_length" | "too_large";
    readonly position?: number;  // 1-based, for a message that points at the problem
    readonly line?: number;      // set only in per-line modes
};
```

- Count `position` in **characters, not UTF-16 code units** — iterate with `for...of` — or
  an emoji earlier in the string throws the number off.
- Keep the reason names about the *cause*, not one direction. `invalid_utf8` had to be
  renamed to `undecodable_text` the moment the character set became configurable.

## 7. i18n

- Message keys may only be built from **literal unions** (`ToolId`, `UuidVersion`, a
  `readonly` tuple). `t(\`options.${row}Name\`)` type-checks when `row` is a union and
  silently rots when it is `string`.
- Numbers that read as prose go through `useFormatter().number()` or an ICU
  `{value, number}` argument, so Bangla renders Bengali numerals. Keep Western digits only
  where the number mirrors machine input.
- Proper names — `UTF-8`, `Shift_JIS`, `LF (Unix)`, `RFC 4648` — are **data, not copy**.
  Keep them out of the message catalogue.
- The client bundle gets a hand-picked slice in `src/app/layout.tsx`. A namespace missing
  there fails at runtime, not at build.
- Bengali ascenders are taller than Latin: never `leading-none` on a localised string. Use
  `leading-[1.3]` or looser.

## 8. Base UI, via shadcn

- `Button` expects a real `<button>`. For navigation use
  `<Link className={cn(buttonVariants(), …)}>`, not `<Button render={<Link/>}>`.
- `TooltipTrigger` / `DropdownMenuTrigger` take `render={<button … />}`.
- `Select` needs `items={{ value: label }}` on the root, or the trigger shows the raw value
  instead of the label.
- `Switch` uses `onCheckedChange`, and it is a `<button role="switch">` — `<label htmlFor>`
  does not associate. Use `aria-labelledby` and `aria-describedby`.
- `Accordion` panels unmount when closed. Pass `hiddenUntilFound` so FAQ answers stay in the
  DOM for find-in-page and crawlers.
- Overriding a vendor class works through `cn`, but variant-prefixed classes only conflict
  with the same prefix: beat `not-last:border-b` with `not-last:border-b-0`, not `border-b-0`.

## 9. Layout

- Grid and flex children need `min-w-0`, or long unbroken output blows the page out at 390 px.
- Wide content — tables, code blocks — scrolls inside its own `overflow-x-auto`. The body
  never scrolls horizontally.
- An invisible element still takes space. A label at `opacity-0` inside a flex row keeps its
  `flex-1` width and shoves the icon off centre; it needs `w-0 flex-none`, and the row needs
  `gap-0`.
- Hover-only affordances stay reachable without a pointer: gate on `[@media(hover:hover)]`
  and pair with `focus-visible:opacity-100`.
- Shared-layout motion indicators need a unique `layoutId`. A component rendered in both the
  desktop rail and the mobile drawer takes a `layoutIdPrefix` prop.

## 10. Options that constrain each other

Find the single rule rather than enumerating pairs. Base64's data URI needs *one unwrapped
standard-alphabet payload*, which disables it under URL-safe, line wrapping, **and** per-line
mode — one predicate, `supportsDataUri(options)`, shared by the domain and the UI.

Disable the control and change its hint to say why. Never silently ignore a setting the user
switched on.

## 11. Scope discipline

- Lift shared code to `modules/tools/` the moment a second tool needs it. Never import
  across tool modules.
- `git mv` stages the rename. Mention it in the handoff, since the working tree is the
  maintainer's.
- Cheap checks are always allowed. Dev servers, production builds, and headless browsers
  need permission **every time** — an earlier yes does not carry over.
