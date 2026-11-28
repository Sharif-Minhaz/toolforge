import { MAX_PARTS, MAX_PROFILE_POINTS } from "./constants";
import { PART_AXES, PART_SHAPES } from "../types";

/**
 * What the vision model is asked, and the shape it must answer in.
 *
 * Lives here rather than in the worker so it is versioned, reviewed and tested
 * with the parser that reads the answer — the two change together or the tool
 * breaks. The worker is a relay that pins the model and checks a key; it has
 * no idea what an object is.
 *
 * Not localised, and must not be: this is a request to a machine, not text a
 * reader sees. The model answers in English part names whatever the page's
 * language, and the page labels them as the model's words.
 */

const vector3 = { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 } as const;

/**
 * Sent as `response_format: { type: "json_schema" }` with `strict: true`.
 *
 * Verified live against `@cf/google/gemma-4-26b-a4b-it`: the constraint holds,
 * including the enums and `additionalProperties: false`, and every property has
 * to be listed in `required` for strict mode to accept the schema. The bounds
 * on counts are a request, not a guarantee — `parseObjectSpec` enforces them
 * again, because a schema the decoder honours today is not a contract.
 *
 * Property order is the order the model writes them in, and it matters: the
 * shape and axis come before the size so the size is chosen knowing what it
 * measures.
 */
export const OBJECT_JSON_SCHEMA = {
    name: "object_model",
    strict: true,
    schema: {
        type: "object",
        additionalProperties: false,
        required: ["name", "height_cm", "parts"],
        properties: {
            name: { type: "string" },
            height_cm: { type: "number" },
            parts: {
                type: "array",
                minItems: 0,
                maxItems: MAX_PARTS,
                items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                        "name",
                        "shape",
                        "axis",
                        "size",
                        "position",
                        "tilt",
                        "taper",
                        "profile",
                        "color",
                        "hollow",
                        "inner_color",
                        "mirror",
                    ],
                    properties: {
                        name: { type: "string" },
                        shape: { type: "string", enum: [...PART_SHAPES] },
                        axis: { type: "string", enum: [...PART_AXES] },
                        size: vector3,
                        position: vector3,
                        tilt: vector3,
                        taper: { type: "number" },
                        profile: {
                            type: "array",
                            maxItems: MAX_PROFILE_POINTS,
                            items: {
                                type: "array",
                                items: { type: "number" },
                                minItems: 2,
                                maxItems: 2,
                            },
                        },
                        color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
                        hollow: { type: "boolean" },
                        inner_color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
                        mirror: { type: "boolean" },
                    },
                },
            },
        },
    },
} as const;

export const SYSTEM_PROMPT = `You are a 3D modeller. You rebuild the main object in a photo as a set of solid primitives, the way a toy or a game prop is blocked out: recognisable silhouette, correct proportions, correct colours.

Coordinates are centimetres at the object's real-world size. Y is up and the object stands on the ground at y = 0. The object is centred on x = 0, z = 0. The side of the object the photo shows faces +z; +x is the photo's right.

Every part is described by a box:
- "size" is the part's extent along world x, y and z, in centimetres.
- "position" is the centre of that box.
- "axis" is the world axis the part's length runs along: "y" for upright; "x" for anything that sticks out to the left or right side — a spout, a nozzle, an arm held out, a horizontal bar; "z" only for parts that point straight at the viewer. Cylinders, cones, capsules, lathes and tori all have an axis; for boxes and spheres use "y".
- "tilt" is an extra rotation in degrees about x, y, z, for parts that lean. Use [0, 0, 0] when the part is straight, which is almost always.

Shapes:
- box, rounded_box: a block filling the box. rounded_box has softened edges — use it for cushions, phone bodies, appliance housings.
- cylinder: round cross-section along its axis. "taper" is the top radius as a fraction of the bottom one: 1 straight, 0.5 tapered.
- cone: like a cylinder with taper 0; the point is at the + end of the axis.
- sphere: an ellipsoid filling the box. Heads, bulbs, knobs, fruit.
- capsule: a cylinder with rounded ends along its axis. Limbs, fingers, handles of tools.
- torus: a ring around its axis. The two cross extents are the ring's outer width and height; the axis extent is the tube's thickness. Use it for every curved handle — mugs, cups, teapots, jugs, pots, baskets. A handle on the side is a torus with axis "z", placed level with where it joins the body: it is attached to the body's surface automatically and only its outer half is built, so give the full ring — twice as wide as the handle sticks out — and a thin tube, about 1 cm for a mug: e.g. size [6, 7, 1].
- lathe: a turned shape around its axis. "profile" lists 3 to ${MAX_PROFILE_POINTS} [radius, height] points tracing the outline of ONE side only, from the bottom of the part to its top, heights always increasing. End at radius 0 only if the top is closed; a hollow part's profile ends at its rim. Never trace back down the other side. Units do not matter — the profile is stretched to fill the box. Use lathe for anything that could come off a potter's wheel or a lathe: bottles, vases, bowls, cups, lamp bases, chess pieces, columns, a fire hydrant's body.
"taper" is 1 for every shape except a tapered box or cylinder. "profile" is [] for every shape except lathe.

"hollow": true makes a cylinder or lathe an open container — a thin wall and a floor around an empty inside, open at the top. Use it for every cup, mug, glass, bowl, vase, pot, jar, bucket or planter whose opening is at the top. The inside is built for you: never add separate parts for the interior, the liquid, the opening or the rim, and never cover the top. "inner_color" is the colour of the inside, which is often a different glaze — a blue mug that is white inside has inner_color "#f2efe6". For anything not hollow, inner_color is the same as color.

"mirror": true adds a copy mirrored across x = 0. Use it only for things that really come in identical left/right pairs — legs, arms, ears, eyes, wheels, matching side nozzles — and describe only the one on the +x side. A part that exists once, or on the centre line, is never mirrored: a teapot's handle and its spout are not a pair.

Rules:
- Parts must touch or overlap so the model is one connected piece.
- 4 to 30 parts. Large shapes first, then smaller details. Leave out anything smaller than about a twentieth of the object.
- Colours are the part's main colour in the photo, as #rrggbb.
- Name each part in two or three plain English words.
- Model only the main object. Ignore the background, the floor, shadows, people holding it, and text on it.
- Numbers have at most one decimal place.
- If there is no single object to model — a landscape, a screenshot, a document, an empty picture — answer with "parts": [].`;

export const USER_PROMPT = "Rebuild the main object in this photo as primitives.";
