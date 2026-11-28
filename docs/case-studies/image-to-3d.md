# Image to 3D Model — A Model That Describes, a Tab That Builds

`src/modules/image-to-3d/`. Read before touching the prompt, the schema, the
parser, the primitive builder, any of the four writers, or the worker.

The tool was rebuilt in November 2026. The first version turned a picture into
a heightfield — brightness or an estimated depth map became height, and an
outline was inflated into a pillow — and readers called it the most broken
tool on the site, correctly: no amount of relief makes a photo of a mug into a
mug. The idea that replaced it came from
[img2threejs](https://github.com/img2threejs/img2threejs), which has a coding
agent look at a photo and _write_ the object as procedural three.js. That
project is an agent workflow, not a library, so nothing of it is imported;
what is borrowed is the split. A vision model reads the picture and answers a
**description** — named primitives with sizes, positions and colours — and the
reader's tab builds the mesh from it.

---

## The pipeline

```
browser: decode → 768 px JPEG over white → Turnstile token
action:  file check → challenge → quota (fails closed) → worker
worker:  bearer key → bounds → gemma-4-26b-a4b-it, thinking off, strict JSON schema
action:  chat completion → parseObjectSpec → ObjectSpec
browser: buildObjectMesh → preview, parts list → scaleMesh → writer
```

Only the description crosses back, so height, smoothness and format never cost
a second call. The prompt and the schema live in `domain/describe-request.ts`,
not in the worker. They change with the parser that reads the answer, in a
commit rather than in a dashboard.

## One — Gemma 4 thinks by default, and thinking is billed

The first full-schema run took 115 seconds, spent all 6,000 tokens and 170
neurons, and answered with an empty `content`. The tokens had gone to
`reasoning_content`, which Workers AI bills and the schema never constrains. The
switch is `chat_template_kwargs: { enable_thinking: false }`. It is not a
top-level parameter, and only the model's `sync-input.json` documents it. With
thinking off, the same photo answered in 18 seconds for 31 neurons.

The worker pins it off, so no caller can turn it back on. If the model is ever
replaced, check the new one's input schema for a reasoning default before
anything else.

## Two — ask which way a part points, never for a rotation

Asked for Euler angles, the model sized a fire hydrant's side nozzles as upright
cylinders and never turned them. Asked for a **world-aligned box** (`size`) and
the **axis the part runs along** (`axis: x | y | z`), it got the nozzles right
first time. A box is something it can read straight off a photograph; a
rotation is arithmetic it does not do. `tilt` survives for parts that lean, and
the prompt says it is almost always zero.

The same reasoning sets every other definition. A lathe profile is stretched to
fill its box in whatever unit the model wrote it in, so the model cannot get
the units wrong. A torus's cross extents are its outer width and height, and
the axis extent is the tube's depth, because those are the measurements a
handle visibly has.

## Three — scaling a unit torus makes doughnuts

The first torus was a unit torus stretched to fit its box, and every mug handle
came out fat. Stretching a round tube by a tall, narrow box makes the tube tall
and narrow with it. `torus` in `primitives.ts` now builds in real units. The ring's
_path_ is an ellipse filling the cross extents, and the tube is round across
it, capped at a third of the narrower extent so the hole stays open.

## Four — an example in the prompt is an instruction

To get hollow cups, the prompt once showed a lathe profile going up the outside
and back down the inside. On the next run the model traced the **whole
silhouette** of every lathe — up one side, across the axis, down the other —
which revolves into the same solid twice, inside itself. A teapot came back
with every turned part doubled.

The paragraph is gone. The prompt now says _one side only, heights increasing_,
and cups are solid: there is no subtraction in this vocabulary, and a solid mug
is a correct blockout. The **parser** enforces it as well, because a prompt is
a request and not a contract. `endAtAxis` cuts a profile at its first return to
radius zero, which turns every traced-back outline the model ever sent into the
solid it meant. The test uses the exact lid the model sent.

## Five — the model describes both sides _and_ marks one mirrored

Told to describe only the +x part of a pair and set `mirror`, the model often
lists the left and the right **and** sets `mirror` on one of them. Copying that
one lands a third nozzle on top of the second. `placeParts` drops a mirrored
copy that would land within 30% of its size of an existing part of the same
shape, and it drops any copy on the centre line, which would only double its
own triangles.

## Six — a reader renames what it cannot tell apart

The GLB gives each part its own node and material, so it opens in Blender as
named, coloured pieces. The reference test caught the first version writing
two nodes called `foot`. three renamed the second to `foot_1`, and Blender
would have made it `foot.001`. `filePartNames` makes names unique before they
are written. The mirrored copy says `mirrored` in English, like the rest of the
model's names, and any name still repeated is numbered. The page shows its own
localised label instead and writes nothing in English to the screen.

---

## Seven — "every edge used once" says nothing about holes

Carried over from the first version, because it still holds and it is still
cheap to break.

A closed manifold uses every edge once in each direction. So does an _open_
sheet: its border edges are used once, in one direction, and never answered.
`unmatchedEdges` in `tests/geometry.ts` is the reverse lookup, and the
primitive tests make three separate claims for every shape on every axis at
every smoothness:

- **once each direction**, which rules out two triangles facing opposite ways
  across one edge;
- **answered from the other side**, which rules out a border;
- **positive signed volume**, which is the only check that catches a part wound
  entirely inside out. A mirrored copy is exactly that until its winding is
  reversed.

Key edges on **position, never on index**. A cylinder's wall and its caps are
separate patches, so they get crisp normals, and they share positions but not
indices. An index-keyed count calls every rim a hole. `+ 0` after `toFixed`
collapses negative zero, or a seam at `sin(±π)` reads as two places.

## Eight — the reference reader changes your data

Every writer is read back through three.js's loaders, because these bytes are
opened by Blender, by slicers and by other people's renderers:

- `ColorManagement.enabled = false` at module scope, or three converts colours
  on the way in and no comparison means anything. `PLYLoader` then hands back
  the raw bytes.
- GLB colours are written **linear** (`srgbToLinear`), as glTF's
  `baseColorFactor` requires. The preview converts its vertex colours the same
  way, which is what makes the preview and the file agree. MTL's `Kd` stays
  sRGB, because importers convert it themselves.

## The unit, which is not a bug

STL, OBJ and PLY are unitless and every program assumes millimetres. glTF's
unit is the metre, so the same 100 mm mug is `100` in three files and `0.1` in
the GLB. The specification wins, and the line under the format picker says
which unit is being written.

---

## What it costs

Measured live on 2026-11-28, thinking off, one pass:

| Subject           | Parts | Seconds | Neurons |
| ----------------- | ----- | ------- | ------- |
| drawn mug         | 2     | 7–9     | 19–23   |
| Utah teapot photo | 5–6   | 19–23   | 34–40   |
| fire hydrant      | 9     | 18–43   | 31–46   |

The free plan is 10,000 neurons a day **per Cloudflare account**, and it is
shared with every worker on that account. The Watermark Remover's FLUX call
alone costs about 1,500. The counters in `constants.ts` — eight a day per
visitor, sixty for the site — are set so this tool spends a third of the day at
its worst case, not all of it. The action logs the neurons a truncated answer
burned, because a model that rambles to the token ceiling is the one case that
costs ten times over.

## What it cannot do

- **One pass, no review.** img2threejs works because a frontier agent renders
  its model and looks at it eight times. Here a 26B model answers once. The
  teapot's spout came back pointing at the viewer on every run. A refine pass —
  render, send the render back with the spec, ask for corrections — would
  double the cost and is the obvious next step if the budget allows.
- **No subtraction.** Cups, bowls and vases are solid.
- **Faces, animals and clothes** do not reduce to a handful of solids, and the
  article says so rather than letting a reader find out.

## Evaluating a prompt change

The front view of a blockout hides most of what is wrong with it. Before
changing the prompt, run it against several photos and render the resulting
spec from the front, the side, three-quarters and the top. A forty-line
software rasteriser over `buildObjectMesh` is enough, and it needs no browser.
Every lesson above was found that way, not by reading JSON.

## The worker

Its source lives in the Cloudflare dashboard. It is reproduced here because the
repository depends on its contract: `{ system, prompt, image, schema,
max_tokens }` in, `{ model, result }` or `{ error: { code, detail } }` out.

```js
const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const MAX_IMAGE_CHARS = 2_000_000; // base64 data URI, ~1.5 MB
const MAX_TEXT_CHARS = 20_000;
const MAX_TOKENS = 6000;

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
const fail = (code, status, detail = "") => json({ error: { code, detail } }, status);

function sameKey(given, expected) {
    const a = new TextEncoder().encode(given);
    const b = new TextEncoder().encode(expected);
    return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}

export default {
    async fetch(request, env) {
        if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);

        const auth = request.headers.get("authorization") ?? "";
        const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!env.API_KEY || !sameKey(key, env.API_KEY)) return fail("UNAUTHORIZED", 401);

        let body;
        try {
            body = await request.json();
        } catch {
            return fail("INVALID_INPUT", 400, "body is not JSON");
        }

        const { system, prompt, image, schema } = body ?? {};
        if (
            typeof system !== "string" ||
            typeof prompt !== "string" ||
            system.length + prompt.length > MAX_TEXT_CHARS
        )
            return fail("INVALID_INPUT", 400, "system and prompt must be strings within the limit");
        if (typeof image !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(image))
            return fail("INVALID_INPUT", 400, "image must be a png/jpeg/webp data URI");
        if (image.length > MAX_IMAGE_CHARS) return fail("IMAGE_TOO_LARGE", 413);

        const input = {
            messages: [
                { role: "system", content: system },
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { url: image } },
                    ],
                },
            ],
            max_completion_tokens: Math.min(Number(body.max_tokens) || 4096, MAX_TOKENS),
            temperature: 0.2,
            // See lesson one.
            chat_template_kwargs: { enable_thinking: false },
        };
        if (schema && typeof schema === "object")
            input.response_format = { type: "json_schema", json_schema: schema };

        try {
            const result = await env.AI.run(MODEL, input);
            return json({ model: MODEL, result });
        } catch (error) {
            const detail = String(error?.message ?? error).slice(0, 500);
            const code = /4006|daily free allocation/i.test(detail)
                ? "QUOTA_EXHAUSTED"
                : /5028|deprecated/i.test(detail)
                  ? "MODEL_RETIRED"
                  : "MODEL_ERROR";
            return fail(code, code === "QUOTA_EXHAUSTED" ? 429 : 502, detail);
        }
    },
};
```

Bindings: Workers AI as `AI`, and a secret `API_KEY` equal to this deployment's
`IMAGE_TO_3D_API_KEY`. The worker has no per-address limit of its own: it would
only ever see this server's address (see the Watermark Remover's case study),
so the per-visitor counter lives in the action.

## What the first version left behind

`tools/domain/segmentation.ts`, `tools/domain/cutout-memory.ts` and
`tools/components/image-dropzone.tsx` were lifted out of this module when the
Background Remover needed them, and they stay. The direct `onnxruntime-web`
dependency and its type shim existed only for the depth model and were
removed; the Background Remover's library brings its own copy. Readers who used
the depth model still had it in a Cache API bucket, so `public/sw.js` deletes
`toolforge-depth-model` on activation (`RETIRED_CACHES`).
