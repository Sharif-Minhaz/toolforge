import type { ModelFormat, ModelOptions } from "../types";

/**
 * Samples along the picture's longest edge.
 *
 * The ceiling is not the interesting number — `MAX_TRIANGLES` is, and it bites
 * first on anything but a square. 384 is what a 1:1 picture can ask for without
 * crossing it, so the stepper never offers a value that is refused on a square
 * and allowed on a panorama.
 */
export const MIN_RESOLUTION = 32;
export const MAX_RESOLUTION = 384;

export const MIN_SMOOTHING = 0;
export const MAX_SMOOTHING = 5;

/** Millimetres across the plate, or around the cylinder. */
export const MIN_WIDTH_MM = 10;
export const MAX_WIDTH_MM = 500;

export const MIN_DEPTH_MM = 0.1;
export const MAX_DEPTH_MM = 50;

export const MIN_BASE_MM = 0.2;
export const MAX_BASE_MM = 20;

/** Share of an inflated body's bulge handed to the picture's own relief. */
export const MIN_DETAIL = 0;
export const MAX_DETAIL = 1;

/**
 * The ceiling on the whole model, walls and backing included.
 *
 * Two things push against each other here. A mesh this size is roughly 60 MB of
 * GLB, which is already more than most viewers open comfortably; and every
 * triangle is built with plain arrays in the reader's own tab, so the number
 * also decides how long the page is unresponsive. 1.2 million is about a second
 * on a laptop and still finer than any consumer printer resolves.
 */
export const MAX_TRIANGLES = 1_200_000;

/**
 * The largest picture worth decoding into a heightfield.
 *
 * Generous, because nothing here is uploaded and the grid is resampled long
 * before the mesh exists — a 40-megapixel photograph and a 400×400 sprite cost
 * the same to convert once they are on the grid. What the cap protects is the
 * decode itself.
 */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export const DEFAULT_OPTIONS: ModelOptions = {
    // Estimated depth, not brightness. Brightness is not depth — a dark object
    // in bright light comes out the wrong way round — and the model that reads
    // the picture as a scene is what turns a smiley pillow into a face.
    source: "depth",
    invert: false,
    // One pass, not zero. A photograph carries sensor and JPEG noise that a
    // displacement turns into visible pimples, and one binomial pass removes
    // them without touching an edge a reader would notice.
    smoothing: 1,
    resolution: 192,
    // A body rather than a plate. Somebody who drops a photograph in wants the
    // thing in it, and a flat relief is the answer to a different question —
    // one the other two shapes are still here to answer.
    shape: "inflate",
    width: 100,
    // Read as full thickness on an inflated body and as relief height on the
    // other two, which is why it is generous by plaque standards.
    depth: 30,
    solid: true,
    baseThickness: 1.5,
    // Half. With real depth under it, the surface is telling the truth about
    // the object's form and deserves an equal say with the outline's bulge;
    // with brightness in its place the same setting is merely tolerable.
    detail: 0.5,
    format: "glb",
};

/** What each format is written as, and what a browser should call it. */
export const FORMAT_EXTENSIONS: Record<ModelFormat, string> = {
    glb: "glb",
    // The three files an OBJ needs travel together or the material is lost.
    obj: "zip",
    stl: "stl",
    ply: "ply",
};

export const FORMAT_MIME_TYPES: Record<ModelFormat, string> = {
    glb: "model/gltf-binary",
    obj: "application/zip",
    stl: "model/stl",
    // PLY has no registered media type, and a made-up `model/ply` would only
    // mean something to this codebase.
    ply: "application/octet-stream",
};

/**
 * glTF measures in metres and this module measures in millimetres, so the GLB
 * writer — and only the GLB writer — divides by this.
 *
 * STL, OBJ and PLY are all unitless by specification, and the convention every
 * slicer and every CAD importer assumes for them is millimetres. Writing metres
 * into an STL to match the GLB would hand a printer a 0.1 mm plate.
 */
export const MILLIMETRES_PER_METRE = 1000;

/** Checked after decoding: four bytes a pixel is what has to fit, not the file. */
export const MAX_PIXELS = 40_000_000;

/**
 * Longest edge of the working copy every later step reads.
 *
 * The grid never asks for more than `MAX_RESOLUTION` samples, so at this size
 * even the finest grid still box-averages several pixels per sample and a
 * larger working copy would change nothing about the mesh. It is the texture
 * that decides the number: 1024 across a 100 mm plate is about 260 pixels per
 * inch, which is past what the relief itself can resolve.
 */
export const WORKING_EDGE = 1024;

/**
 * Above this, a PNG or JPEG the reader picked is re-encoded from the working
 * copy rather than embedded as it arrived.
 *
 * Embedding the original is the better answer when it is small: it is the
 * picture exactly as it was, with no second generation of JPEG artefacts and no
 * encode to wait for. It stops being the better answer when a 20 MB photograph
 * would ride inside a 2 MB mesh.
 */
export const MAX_EMBEDDED_TEXTURE_BYTES = 6 * 1024 * 1024;

/** Quality for a re-encoded texture. Opaque pictures go to JPEG; the rest to PNG. */
export const TEXTURE_JPEG_QUALITY = 82;
