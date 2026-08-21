import "pdfmake";

/**
 * `@types/pdfmake` describes the two ways of loading a font as environment
 * halves: `addVirtualFileSystem` is marked "browser only", and nothing at all
 * is declared for the server.
 *
 * The published types are right that `addVirtualFileSystem` exists on only one
 * of the two builds — it is defined in `js/browser-extensions/index.js` and has
 * no counterpart in `js/index.js`. What they leave out is that **both** builds
 * carry the virtual file system itself: `js/base.js` sets `this.virtualfs` in
 * its constructor, and the browser's `fs` shim is a re-export of the very same
 * instance. So `virtualfs.writeFileSync` is the one method that works wherever
 * the module resolves, which is what lets this repository keep a single engine
 * instead of one per environment.
 *
 * An augmentation rather than an ambient declaration, so this file carries a
 * top-level import: there *is* an existing declaration here, and the point is
 * to add one member to it rather than to replace it.
 */
declare module "pdfmake" {
    export const virtualfs: {
        /**
         * Stores a file the engine can later resolve by name. `content` is
         * base64 when `encoding` says so, which is how a `.ttf` gets in
         * without a binary channel.
         */
        writeFileSync(filename: string, content: string, encoding: "base64"): void;
        existsSync(filename: string): boolean;
    };
}
