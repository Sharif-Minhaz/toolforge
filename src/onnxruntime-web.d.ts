/**
 * `onnxruntime-web` ships types, and hides them.
 *
 * Its `package.json` `exports` map has no `types` condition, so under
 * `moduleResolution: "bundler"` the import resolves to `dist/ort.bundle.min.mjs`
 * and nothing else — the `types.d.ts` at the package root is never consulted.
 * That file is three lines re-exporting `onnxruntime-common`, whose own
 * `exports` map has the same gap and no subpaths, so the package path is
 * refused too. A `paths` entry in `tsconfig.json` would reach it, and would
 * also be honoured by Next's bundler, which would then try to bundle a `.d.ts`.
 *
 * A relative path is subject to neither, so the common package's declaration
 * root is named from here, and the whole of its API becomes this module's.
 *
 * Ambient rather than an augmentation, which is why this file has no top-level
 * import: a `declare module` inside a module file augments an existing
 * declaration, and there is none to augment.
 */
declare module "onnxruntime-web" {
    const ort: typeof import("../node_modules/onnxruntime-common/dist/esm/index");

    export = ort;
}
