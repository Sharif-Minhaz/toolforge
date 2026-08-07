# Putting Something on a Map

A pin is a claim, and it is a far stronger one than the data behind it usually
supports. The Domain Inspector's propagation card
(`domain-inspector/components/world-map.tsx` plus `domain/countries.ts`) is the
shape to copy, and most of what it cost was deciding what _not_ to draw.

---

## Match the pin's precision to the data's

Every country code in that tool comes from a registry — an RDAP allocation, an
operator's published service location — and a registry knows which country a block
was assigned to, never which building it is plugged into.

So the coordinates are **country centroids**, the basemap is capped at `MAX_ZOOM`
so it never promises street level, and the copy says which claim is being made. A
city-level pin over country-level data is a lie that renders beautifully.

## Reject a data source whose location you cannot defend

Three resolvers were dropped from the propagation table for exactly this:

- **Tiarap** and **RethinkDNS** both sit behind Cloudflare, so their pins would
  land on Cloudflare's network and a duplicate would be dressed as an independent
  sample.
- **NextDNS** answers from an Austrian block while the company is American, so no
  single country is not misleading.

Finding this out cost one `curl` per candidate through Team Cymru's origin zone.
Do it before writing the table, not after.

## A measurement with two causes has to name the second one

The card was finished, tested and byte-correct when a live run against
`github.com` returned five different addresses across nine resolvers. Nothing was
wrong: that is GeoDNS steering, and from one vantage point it is
indistinguishable from a change still spreading.

Amber with no sentence beside it reads as "your change is broken". The fix is
`divergenceNote`, rendered only when there _is_ divergence — and the general rule
is that **a signal with an innocent explanation must carry it**, or the tool
trains people to ignore the signal.

---

## Leaflet's seven traps

All of these are in `world-map.tsx`.

- **Import it inside the effect, never at the top.** It is ~150 KB that touches
  `window` on evaluation, so a static import both breaks the server render and
  lands in the island's first chunk for every reader — including the ones whose
  report has no map in it.
- **`circleMarker`, not `marker`.** Leaflet's default pin is a PNG resolved
  against a CSS-relative path, which every bundler breaks and everybody patches
  with `L.Icon.Default.mergeOptions`. A circle is an SVG `<path>` carrying a
  `className`, and Leaflet writes `fill`/`stroke` as presentation attributes —
  which any CSS rule outranks, so a pin takes design tokens directly.
- **Build tooltips as DOM, not as an HTML string.** `bindTooltip` accepts both and
  the string form is `innerHTML`. Pin text is derived from what a stranger's DNS
  returned, so the only safe version is the one where escaping is not a step
  somebody can forget.
- **One effect that rebuilds everything, not three that create, retint and
  repin.** Creation is async, so an effect ordered after it can run before the map
  exists — a bug that only appears on a slow connection. Rebuilding on a theme
  toggle costs a few tiles and nine circles, and the discarded pan position is not
  state anyone relied on. The `cancelled` flag checked immediately after the
  `await` is what stops React's double effect from meeting "Map container is
  already initialized".
- **A basemap built as a backdrop has to be brought onto the palette, and that is
  a solve rather than a taste.** Dark Matter and Positron both sit _under_ bright
  data overlays by design, and their tiles are pure neutral grey — dark is water
  `#262626` over land `#090909`, light is water `#d4dadc` under land `#fafaf8`.
  The dark card is `oklch(0.187)`, which falls _between_ those two, so land and
  water are each within a few values of their own frame and the whole thing
  mushes. Turning the brightness up until it separates is the wrong fix and looks
  it: it lands the ocean at `oklch(0.471)`, a lit grey slab on a dark card, which
  reads as a screenshot pasted into the page. The right fix moves land _below_
  `--background` and water _above_ `--muted`, so the map reads against the card
  from both sides at the card's own lightness.

    That is tractable because the source is neutral: a colour matrix on a grey
    collapses to three constant per-channel gains, so
    `sepia → hue-rotate → saturate` is exactly a tint and `brightness → contrast`
    in front of it is exactly a levels remap. Solve them numerically against the
    tokens — port the Filter Effects matrices, grid-search the tint for the
    target's channel ratios, then search brightness/contrast on the _composed_
    chain. Solving the levels algebraically against a scalar gain is wrong; the
    tint's gain is per-channel, and treating it as scalar clipped the light theme
    to flat white. Then **render it and look at it** — raw, previous and solved
    side by side on the card colour, per
    [`../testing.md`](../testing.md#a-byte-exact-codec-can-still-be-a-bad-tool).
    That is what showed the light theme's low `saturate` doing a second job nobody
    asked for: Positron draws administrative borders in a salmon pink that belongs
    to nothing else on this site.

    Reach for the `_nolabels` tiles at the same time. CARTO labels each region in
    its local script, so a single card ends up carrying `AFRIKA`, `亚洲` and
    `AMÉRICA DO SUL` at once, in none of which is the reader's chosen locale.

- **Animating a `circleMarker` needs `transform-box: fill-box`.** An SVG path
  scales about the viewport origin by default, so a ring that should expand out of
  its pin instead flies off the map. Pair it with `transform-origin: center`. This
  is safe alongside Leaflet, which positions a path by rewriting its `d` attribute
  and never touches `transform` on the path itself. Bind the tooltip to the widest
  ring rather than the core — a 4px hover target is not one — and keep the inner
  circles `interactive: false` so the pointer falls through to it.
- **A pale border around the map is two bugs, not a style choice.** Leaflet puts
  `.leaflet-container` on the element it is _handed_, so `[&_.leaflet-container]`
  — the descendant form — silently matches nothing and leaves Leaflet's own `#ddd`
  as the backdrop. `[&.leaflet-container]` is the fix, and it is worth checking
  any vendor override that targets a class the library adds to a node you already
  own. That backdrop is only visible because of the second bug: `zoomSnap` defaults
  to whole numbers and `fitBounds` snaps _down_, so a frame the world nearly fills
  gets the next size smaller with a band of backdrop above and below it. Set
  `zoomSnap: 0` for an exact fit, and floor `minZoom` at the zoom where the world
  covers the frame — `log2(max(width, height) / 256)`, since Web Mercator is a
  square of `256·2^zoom` pixels — recomputed on Leaflet's `resize`. Where covering
  the frame and showing every pin conflict, covering wins: a pin that needs a drag
  is a smaller loss than a border the reader reads as a rendering fault.

## Two more that are not Leaflet's fault

- **Tiles are a third-party request from the reader's browser**, and this site
  claims to run in the browser and store nothing. CARTO is used because it is the
  rare basemap with a matched light/dark pair — raw OpenStreetMap has no dark twin
  and would leave one theme with a white rectangle in it — and the fetch is
  disclosed in the README rather than left implied.
- **A map is hover-only, so it can never be the only copy.** Every pin's contents
  also appear as text in the list beside it. `country-chip.tsx` is the same rule at
  chip scale: the two-letter code stays visible next to the flag, because Windows
  renders a regional-indicator pair as plain letters, several flags are
  unrecognisable to most readers, and a screen reader gets nothing from the glyph.
  The flag is ornament, the code is the label, and the tooltip — on a real
  focusable `<button>` — is the answer for whoever wants it.

---

## Country names

`Intl.DisplayNames` and the hydration boundary it lives behind:
[`../internationalization.md`](../internationalization.md#country-names).
