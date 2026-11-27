# Land Measurement

`src/modules/land-measurement/` — an area in one unit, written out in every
Bangladeshi and international unit at once, and laid on football pitches.

Read it before touching `domain/constants.ts`, `domain/units.ts` or the pitch.

---

## The sources disagree, and the tool says which side it took

The government's own land record gives a গণ্ডা as "2 শতাংশ" and as "864 sq ft"
in the same table. They differ: 2 শতাংশ is 871.2 sq ft. The square feet were
kept, because everything under the গণ্ডা — কড়া 216, ক্রান্তি 72, তিল 3.6 — is
written in them, so the chain stays whole. The cost is a standard কানি of
39.67 শতাংশ rather than the "40 শতাংশ কানি" people say. FAQ 4 says so. Do not
"fix" it to 871.2 without changing the chain under it in the same edit.

## A district changes a chain, never one unit

Banglapedia's agrometrology tables print district headings in pairs over shared
lists, so most figures cannot be tied to one district. Only the ones that can
are offered: বিঘা 52 (Faridpur), 48 (Dinajpur), 60 (Rangpur); কানি 120
(Comilla/Noakhali), 160 (Chittagong).

The rule that makes them usable is in `squareFeetPerUnit`: a region sets the
size of the _top_ of a chain, and the subdivision is kept — 20 কাঠা to the
বিঘা, 20 গণ্ডা to the কানি — because that is the part every district agrees on.
It also makes the tables agree with themselves: a 120-শতাংশ কানি gives a
6-শতাংশ গণ্ডা, which is the Noakhali গণ্ডা Banglapedia prints separately, and a
160-শতাংশ কানি gives the 8-শতাংশ গণ্ডা of its Chittagong row. Units defined
against the acre — শতাংশ, অযুতাংশ — and the international ones never move.

Every row prints `1 katha = N sq ft` under its name, so the size a figure assumes is
on screen even with the district picker folded away.

## The typed unit is never a round trip

The row for the unit that was typed shows the typed number, not
`value × size ÷ size`. Otherwise `5 কাঠা` reads `4.9999999` in its own row,
which a reader takes as the tool doubting their deed.

## The size picture: an everyday object, not always a pitch

The first version laid every plot on a football pitch. That fails at both
ends: one square metre is a speck on 7,140 m², and a zoomed inset with a scale
bar — tried next — was still a puzzle readers could not decode. A pitch is the
right comparison only for land as big as one.

`chooseReference` picks the **largest** everyday object the plot is at least
as big as, from a ladder where no step is more than about nine times the last
(a test enforces it): single bed 1.9 × 0.9 m, car parking space 5 × 2.5 m,
badminton court 13.4 × 6.1 m (BWF), tennis court 23.77 × 10.97 m (ITF doubles),
futsal court 40 × 20 m, football pitch 105 × 68 m (FIFA). Largest-not-nearest
means the sentence is always "about 3.2 parking spaces", never "0.04 of a tennis
court". Only a plot smaller than a bed is a share — "about 58 % of a single
bed".

`ReferenceFigure` draws the plot as a square beside that many objects at one
scale — whole ones solid, the partly covered last one dashed — with just enough
detail to be recognised at a glance — `components/object-drawings.tsx` draws
each in its own real metres: a bed with headboard, pillow and quilted blanket;
a painted bay with a 4.4 × 1.8 m car (wheels, mirrors, glass, lights); and
courts with their regulation lines and nets. Outline-only versions were tried
first and read as unlabelled rectangles. The sentence and the
drawing read one value, `roundedCount`: an early version rounded the sentence
but drew from the raw ratio, so one কানি — 2.007 futsal courts — read "about 2"
and was drawn as three. A partial last object is drawn whole but faded, with the
covered share at full strength (a `clipPath`) and a dashed line where the plot
runs out, so 2.1 and 2.9 look different and the object stays recognisable. `tileColumns` lays the objects out in whichever
grid is nearest square, nearly touching, so the block is the same shape as the
plot beside it — two futsal courts stack into 40 × 40 m next to one কানি's
40 × 40 m square.

The plot itself is drawn the way a survey sketch draws one — ground texture
(an SVG pattern whose id comes from `useId`, so two figures cannot collide), a
boundary line, a pillar at each corner, and both sides dimensioned in metres —
with the side in feet in the legend. A flat purple square read as a colour
swatch, not as land. The sentence above it is
also the figure's text equivalent. Land of a pitch or more falls through to the
pitch grid below.

## The pitch grid

105 × 68 m, the FIFA-recommended size — 7,140 m². Geometry lives in
`domain/pitch.ts` in metres; the SVG only scales it.

- A plot is a square centred on the spot while it fits between the touchlines
  (68 m a side). Past that it becomes a full-width strip, because a square
  bigger than the pitch's width would spill off the sides and stop showing how
  much of the pitch it covers.
- A ratio within 1e-9 of a whole number snaps to it. Without that, two pitches'
  worth of কাঠা arrives as 1.9999999 pitches and draws a second pitch with an
  invisible sliver on it.
- Thirty pitches at most; past that every drawn pitch is a full one and the
  caption says how many there would be.
- Lines use `vector-effect: non-scaling-stroke` — set on every shape with
  `[&_*]:`, because the property is not inherited from a `<g>` — so a pitch in a
  30-pitch grid and a pitch drawn alone have the same 1 px lines.

## On a phone

A designer's review put it plainly: on a 360 px screen the tool read as a
textbook — the input, seventeen rows, then thirty pitches — when the job is
"convert five কাঠা". The desktop layout stays; below `lg` four things change,
all by CSS over markup that is the same on server and client:

- **One group at a time.** A `SegmentedControl` (Bangladeshi · International)
  shows one list; from `lg` both columns sit side by side and the switch is
  gone. Nothing is dropped — "Copy all" still copies every unit, and the
  group headings stay for assistive tech.
- **The input row is sticky** under the 56 px mobile header (`top-14`). It is a
  direct child of `CardContent`, because a sticky element only slides inside
  its parent, and the card takes `overflow-visible` for the same reason the
  image resizer's does. The field is 16 px on a phone so iOS does not zoom it.
- **Four pitches, then a button** for the rest. The sentence and the
  "Showing N of M" caption already carry the count; the button says it too.
  The everyday-object figure is capped at 240 px tall instead of 320.
- **Copy targets are 36 px**, not 28.

"Copy all" is the share action the review asked for: plain lines from
`domain/summary.ts`, headed by what was typed, with a district-sized unit
naming its district so the figure survives being forwarded.

Two suggestions were declined. The numbered `1`/`2` badges are the site's
signature for the path through a tool
([`workbench-layout.md`](../patterns/workbench-layout.md)), so they stay —
but the size comparison lost its `3`, because it is an aside about the result,
not a step. Unit search was skipped: seventeen units in a select do not need
one.
