import { z } from "zod";

import { buildObjectMesh, meshHeight, scaleMesh } from "@/modules/image-to-3d/domain/assemble";
import {
    DEFAULT_SETTINGS,
    FORMAT_EXTENSIONS,
    MAX_HEIGHT_MM,
    MAX_PARTS,
    MAX_PROFILE_POINTS,
    MIN_HEIGHT_MM,
} from "@/modules/image-to-3d/domain/constants";
import { buildModelBytes } from "@/modules/image-to-3d/domain/export";
import { PART_AXES, PART_SHAPES } from "@/modules/image-to-3d/types";
import {
    meshDetailSchema,
    modelFormatSchema,
} from "@/modules/image-to-3d/validation/model-options";
import { parseObjectSpec } from "@/modules/image-to-3d/validation/object-spec";
import { bytesToBase64 } from "@/modules/tools/domain/base64";

import { defineMcpTool } from "../domain/define-tool";
import { refuse, refuseWithReason, succeed } from "../domain/result";

/**
 * The Image to 3D Model's second half — a description of an object as
 * primitives, built into a mesh and written as GLB, OBJ, STL or PLY.
 *
 * Exposed under `CLAUDE.md` rule 20 because that half needs no canvas, no
 * worker and nobody's API budget: the builder and the four writers are pure,
 * and `reference.test.ts` already drives them through three.js's own loaders
 * under `bun test`. The *first* half — sending a picture to a vision model to
 * get the description — is withheld, for the AI tools' reason in `index.ts`:
 * it spends the Workers AI allowance this deployment shares between tools, and
 * a model calling over MCP has eyes of its own. It can look at the picture and
 * write the parts itself, which is exactly what this tool takes.
 *
 * The parts are the same shape the page's vision model is asked for, read by
 * the same `parseObjectSpec`, so a description that builds here builds there
 * and is bounded by the same rules.
 *
 * The output is bounded too: a file that came back as several megabytes of
 * base64 would be several megabytes of somebody's context window, so past the
 * ceiling the call is refused by name with the setting that would shrink it.
 */

/** The file itself, before base64 turns it into four thirds of that. */
const MAX_MCP_MODEL_BYTES = 1_572_864;

const vector3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

const partSchema = z.object({
    name: z.string().max(80).describe("Two or three plain words: `mug handle`, `left ear`"),
    shape: z
        .enum(PART_SHAPES)
        .describe(
            "box, rounded_box, cylinder, cone, sphere (an ellipsoid filling the box), capsule, torus (a ring), or lathe (a turned shape from `profile`)",
        ),
    axis: z
        .enum(PART_AXES)
        .default("y")
        .describe("The world axis the part's length runs along; `y` is upright"),
    size: vector3.describe(
        "Centimetres along world x, y and z — the box the part fills. For a torus, the axis extent is the tube's depth",
    ),
    position: vector3.describe("Centimetres: the centre of that box. Y is up, +z faces the viewer"),
    tilt: vector3
        .default([0, 0, 0])
        .describe("Degrees about x, y, z, applied in that order, for a part that leans"),
    taper: z
        .number()
        .finite()
        .default(1)
        .describe("Box and cylinder only: top width as a share of the bottom, 0–1"),
    profile: z
        .array(z.tuple([z.number().finite(), z.number().finite()]))
        .max(MAX_PROFILE_POINTS)
        .default([])
        .describe(
            "Lathe only: [radius, height] points tracing one side from bottom to top, any unit — stretched to fill the box",
        ),
    color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default("#9ca3af")
        .describe("The part's colour as #rrggbb"),
    hollow: z
        .boolean()
        .default(false)
        .describe(
            "Cylinder or lathe only: an open container — cup, bowl, vase — built as a thin wall and floor, open at the top. Never add separate interior or lid parts",
        ),
    inner_color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional()
        .describe("The inside of a hollow part as #rrggbb, when it differs from `color`"),
    mirror: z
        .boolean()
        .default(false)
        .describe("Add a copy mirrored across x = 0, for one of a left/right pair"),
});

export const imageTo3dBuildTool = defineMcpTool({
    toolId: "image-to-3d",
    verb: "build",
    title: "Build a 3D model from primitives",
    description:
        "Build a 3D model file from a description of an object as simple solids — boxes, cylinders, cones, spheres, capsules, rings and lathed profiles, each with a size, centre, colour and name — and return it as base64 GLB, OBJ (zipped with its material file), STL or PLY. Sizes are centimetres at real-world scale, Y up; the result is stood on the ground and centred whatever positions are given. Cups, bowls and vases are one part with `hollow: true`. A ring level with a body and beside it becomes a handle: it is moved onto the body's surface and only its outer half is built. Every part is a closed solid and becomes its own named, coloured object in GLB and OBJ. This does not look at a picture: describe the object yourself, part by part. GLB is in metres as glTF requires; the other three are in millimetres.",
    kind: "offline",
    inputSchema: z.object({
        name: z.string().max(80).default("object").describe("What the object is"),
        parts: z.array(partSchema).min(1).max(MAX_PARTS),
        format: modelFormatSchema.default(DEFAULT_SETTINGS.format),
        detail: meshDetailSchema
            .default(DEFAULT_SETTINGS.detail)
            .describe("How finely curves are divided: low, medium or high"),
        height: z
            .number()
            .int()
            .min(MIN_HEIGHT_MM)
            .max(MAX_HEIGHT_MM)
            .optional()
            .describe("Millimetres to the top. Omit to keep the size the parts describe"),
    }),
    run: ({ name, parts, format, detail, height }) => {
        // Through the page's own parser, so the same bounds apply: absurd sizes
        // clamped, profiles cut at the first return to the axis, broken lathes
        // turned into cylinders.
        const parsed = parseObjectSpec(JSON.stringify({ name, height_cm: 0, parts }));

        if (!parsed.ok) {
            return refuseWithReason("Image to 3D Model", parsed.reason);
        }

        const built = buildObjectMesh(parsed.spec, detail);

        if (built === null) {
            return refuseWithReason("Image to 3D Model", "no_object");
        }

        const mesh = height === undefined ? built.mesh : scaleMesh(built.mesh, height);
        const bytes = buildModelBytes({
            mesh,
            format,
            name: parsed.spec.name,
            stem: "model",
            // Only ever reaches a ZIP entry's timestamp. Fixed so the same call
            // returns the same bytes.
            generatedAt: new Date(0),
        });

        if (bytes.length > MAX_MCP_MODEL_BYTES) {
            return refuse(
                "output_too_large",
                "The model file is larger than this endpoint will return as base64.",
                {
                    reason: "output_too_large",
                    bytes: bytes.length,
                    limit: MAX_MCP_MODEL_BYTES,
                    // The one setting that shrinks every format at once.
                    suggestion: detail === "low" ? "fewer parts" : "detail: low",
                },
            );
        }

        const top = Math.round(meshHeight(mesh));

        return succeed(
            `Built ${parsed.spec.name} from ${built.stats.parts} parts: ${built.stats.triangles} triangles, ${top} mm tall, as ${format.toUpperCase()}.`,
            {
                filename: `model.${FORMAT_EXTENSIONS[format]}`,
                format,
                heightMm: top,
                parts: mesh.groups.map((group) => group.name),
                triangles: built.stats.triangles,
                vertices: built.stats.vertices,
                bytes: bytes.length,
                base64: bytesToBase64(bytes),
            },
        );
    },
});
