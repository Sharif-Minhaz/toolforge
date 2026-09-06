# Image to 3D — A Mesh Is Only As Good As What Reads It

`src/modules/image-to-3d/`. Read before touching the mesh builder, any of the
four writers, or the tests that check them.

Seven lessons, in the order they cost time. The first is about a test that passed
while proving nothing. The second is about a specification everybody gets wrong
on purpose. The third is about the difference between one place and two. The
fourth is about what a reference reader does to your data before it hands it
back.

---

## One — "every edge used once" says nothing about holes

The first watertightness test counted directed edges by position and asserted
every count was exactly one. It passed on both shapes, immediately, and it was
worthless.

A closed manifold uses every edge once in each direction. But so does an _open_
sheet: its border edges are used once, in one direction, and never answered. The
count is one either way. The assertion was true of the solid model, true of the
open surface, and true of a model with a square hole punched through it.

The half that was missing is the reverse lookup:

```ts
export function unmatchedEdges(mesh: Mesh): string[] {
    const counts = directedEdgeCounts(mesh);

    return [...counts.keys()].filter((edge) => {
        const [from, to] = edge.split("|");

        return (counts.get(`${to}|${from}`) ?? 0) !== counts.get(edge);
    });
}
```

Two separate claims, and the tests now make both: **once each direction** rules
out two triangles facing opposite ways across one edge, and **answered from the
other side** rules out a border. Neither implies the other. The open-surface test
asserts the exact number of unmatched edges rather than merely "some", so the
solid case cannot quietly start failing in the same direction and still pass.

The third check earns its place for a reason neither of those covers: a mesh
wound entirely inside out satisfies both. `signedVolume` is the divergence
theorem over the whole index buffer, and a positive result is the only evidence
that the triangles face out rather than in.

**Key it on position, never on the index.** Wall quads carry their own four
vertices so they can be flat-shaded, and a cylinder's first and last columns are
one place in space with two texture coordinates. An index-keyed edge count calls
every one of those a hole.

## Two — negative zero is a second place

The seam test failed with `-0.0000` on one side and `0.0000` on the other. The
cylinder's seam sits at `sin(±π)`, which is `∓1.22e-16` — the same point, and two
different strings once it has been through `toFixed`.

That is not a test bug so much as a warning about every position-keyed map in
this module. `Number(value.toFixed(4)) + 0` collapses it. Without the `+ 0`, the
watertightness check above would have reported the entire seam as unmatched, and
with the weak version of that check it reported nothing at all — the two bugs
hid each other.

## Three — a wrap has to agree with itself

A cylinder's column `0` and column `columns - 1` are the same place on the model
and two entries in every buffer, because they need `u = 0` and `u = 1`
respectively for the texture to be stretched across exactly once. Two things
follow, and both were wrong first:

- **The last column takes the first column's height.** Reading its own leaves the
  two ends of the wrap at different radii, which is a crack, not a seam. It is
  one line in `heightAt`, and nothing else in the builder knows about it.
- **Their normals are welded afterwards.** Each vertex accumulates only from the
  triangles on its own side, so left alone the seam renders as a bright line down
  the model under any light. `weldNormals` averages the pair and writes it back
  to both.

Note what is _not_ fixed: the picture's left and right edges are different pixels
and the relief steps where they meet. That is inherent to wrapping something that
does not tile, the mesh is closed there, and the article says so rather than
pretending otherwise.

## Four — the reference reader is also code, and it changes your data

Every writer is checked by parsing its own output back through three.js's
loaders, for the reason `blurhash.md` gives: these bytes are read by Blender, by
a slicer, by somebody else's renderer, and a wrong chunk length still produces a
file that looks exactly like the format it claims to be.

Two things about that reader had to be understood before the comparison meant
anything:

- **three converts sRGB to its linear working space on the way in.** A PLY vertex
  colour written as `9` comes back as `1`. Correct rendering, useless for asking
  whether the bytes survived — so the reference test sets
  `ColorManagement.enabled = false` at module scope, and the comparison is then
  byte-exact.
- **`GLTFLoader` cannot decode an embedded picture under Bun**, which has no
  `createImageBitmap`. It logs that it could not load the texture and carries on,
  so the geometry assertions still hold. The texture path is checked separately
  and structurally instead: the GLB's own JSON chunk, the image `bufferView`, and
  the embedded bytes compared against what went in. Where a loader cannot reach,
  say what was checked instead rather than letting a passing test imply more than
  it proved.

## The unit, which is not a bug

STL, OBJ and PLY are unitless by specification and every tool that reads them
assumes millimetres. glTF is not unitless — its unit is the metre, and there is
no field to say otherwise. So the same 100 mm plate is `100` in three files and
`0.1` in the GLB.

This is decision tree 45/46 landing on **match the specification**: the output is
read by other people's software, so diverging to make Blender's first impression
nicer would be wrong by a factor of a thousand everywhere the unit is respected.
What that buys is a disclosure obligation — the line under the format picker says
which unit is being written, in the tab, rather than only in the article.

## Two smaller things worth keeping

- **`estimateMesh` is exact, not approximate.** The page shows the triangle count
  beside the controls and refuses on it, so an estimate that disagreed with the
  builder would make the refusal look like a bug. The builder allocates its
  buffers from that same function, which is what makes the two agree by
  construction; a test asserts the returned mesh fills them exactly.
- **Composite over white before averaging, never after.** The colour behind a
  fully transparent pixel is arbitrary, and letting it into a box average draws a
  halo around every cut-out. Alpha itself survives untouched, which is what
  leaves `source: "alpha"` able to see the cut-out at all.

---

## Five — vertex slots have to be numbered in the order the vertices are written

Masking cells brought a vertex map: only grid points that a kept cell touches
become vertices, so every surface needs grid index → vertex slot.

The first version handed out slots while walking cells, `claim(a); claim(b);
claim(c); claim(d)`. The builder then _emits_ vertices by walking the grid row by
row. Those are two different orders, so every triangle was wired to the wrong
corners.

What made it expensive is how it failed. The mesh had exactly the right number of
vertices and triangles, every normal was a unit vector, every attribute was in
range, and the preview drew something that looked like a crumpled version of the
picture — plausible enough to blame on the new inflation maths. The only check
that named it was the edge count, and only because it counts by _position_.

Slots are now assigned in a second pass, in grid order. If you ever need a
different emission order, change both in the same edit or neither.

## Six — closure depends on the outline being exactly zero, everywhere it is

An inflated body has no walls. The front and back halves are mirror images, both
zero-height on the outline, so their boundary triangles land on the same points
wound opposite ways and cancel. That is the whole seal, and it is fragile in two
specific places:

- **The frame is outside, whatever the picture says.** A distance transform that
  only treats transparent pixels as outside gives every border point a distance of
  one step, not zero — so a photograph with no transparency at all, or a subject
  cropped by the edge, stood a full bulge high against a straight wall with
  nothing to close it. `buildSilhouette` clips the border ring before the
  transform. Skip it and the model is open along its entire perimeter.
- **The relief is multiplied in, never added.** Surface detail scales the bulge:
  `bulge × (1 − detail + detail × relief)`. Added instead, the outline would lift
  off zero as soon as the detail slider moved, and the halves would stop meeting.
  There is a test that fixes this — `inflatedHeight(0, …)` is zero for every
  combination of the other two arguments — because it is a one-character change to
  get wrong and nothing else would notice.

## Seven — a fixed cell diagonal makes zero-area fins along an outline

Every point on the outline is at exactly zero. So a cell with a single corner
inside has three corners at zero, and splitting every cell along the same
diagonal puts all three of them in one triangle. Front and back then emit that
triangle at identical points: a zero-area fin, invisible and weightless, and an
edge belonging to four faces to anything asking whether the mesh is manifold.

The fix is to split along whichever diagonal carries more height. Both triangles
then contain both diagonal endpoints, and the chosen diagonal always has a raised
end, so no triangle can be all-zero. Front and back read the same heights and make
the same choice, which is what keeps their boundary edges cancelling. On a plate,
where nothing is exactly zero, it is the ordinary quality heuristic — split along
the ridge rather than across it — and a flat field ties and splits as it always
did.

**What is left is a real limit, not a bug to chase.** A feature narrower than one
sample has no interior for the distance transform to find, so both of its sides
sit at zero and the halves touch along it: a zero-thickness membrane joining two
lobes. The model stays sealed — nothing leaks through a membrane — but that edge
is non-manifold. Raising the resolution is the fix. The tests say exactly this:
closed and outward-facing on every subject at every grid, manifold only where the
grid can carry the subject, and one test that pins the pinch so it stays a
documented shape of the tool rather than something that quietly starts leaking.

## What was lifted, and why

Two things left this module during the second pass, both under `CLAUDE.md`
rule 31:

- **`tools/domain/segmentation.ts`** — the `ISNet` driver, the model table and the
  `ImageData` trap, which were the Background Remover's. Two tools now ask the
  same model the same question; a second copy would be a second place for the
  byte counts to go stale. `tools/domain/canvas.ts` went with it, because
  `releaseCanvas` is a fact about `<canvas>` rather than about cutting anything
  out.
- **`tools/components/image-dropzone.tsx`** — four tools had written out the same
  dashed panel and hidden input, and the fourth drifted. An intake that does not
  look like the intake on the tool a reader used yesterday is the first thing
  they notice, and it was the first thing reported.
