import { bytesToBase64 } from "@/modules/tools/domain/base64";

import type { PdfFontFamily } from "../types";
import { packFiles } from "./font-registry";
import type { PdfPreparation } from "./prepare";

/**
 * The one place `pdfmake` is actually run.
 *
 * Everything above this file is data: a document model, a document definition,
 * a list of fonts. This is where that becomes bytes, and it is deliberately the
 * only module in the tool that imports the engine — which is what lets the
 * layout be tested under `bun test` with no canvas and no fonts.
 *
 * **Where the font bytes come from is injected.** The browser fetches a pack
 * from `/fonts`; a server reads it off disk; a test hands over a buffer it
 * already has. None of those is this layer's business, and injecting the loader
 * is what keeps a single engine instead of one per environment — the same shape
 * `tools/domain/file-saver.ts` uses for the three browser calls behind a
 * download.
 *
 * `virtualfs.writeFileSync` is the registration method rather than
 * `addVirtualFileSystem`, because only the first exists on both of pdfmake's
 * builds. See `src/pdfmake-virtual-fs.d.ts`.
 */

/** Hands back the bytes of one font file, by its bare name. */
export type FontFileLoader = (filename: string) => Promise<Uint8Array>;

type Engine = typeof import("pdfmake");

/**
 * The engine and its bundled Roboto, imported once.
 *
 * Memoised because `build/pdfmake.js` and its font data are together the
 * largest thing this page can load, and because pdfmake is a singleton: fonts
 * and layouts registered on it stay registered. Both of those are idempotent —
 * re-declaring a family and re-writing a file both overwrite with the same
 * value — so a second document costs nothing and changes nothing.
 */
let engine: Promise<Engine> | null = null;

async function loadEngine(): Promise<Engine> {
    engine ??= (async () => {
        const [module, fonts] = await Promise.all([
            import("pdfmake"),
            import("pdfmake/build/vfs_fonts.js"),
        ]);

        const pdfMake = ("default" in module ? module.default : module) as Engine;
        const bundled = (("default" in fonts ? fonts.default : fonts) ?? {}) as Record<
            string,
            string
        >;

        for (const [filename, base64] of Object.entries(bundled)) {
            pdfMake.virtualfs.writeFileSync(filename, base64, "base64");
        }

        // Nothing this tool builds ever names a URL: a picture is embedded as a
        // `data:` URI by the time it reaches a definition, and `read-html.ts`
        // refuses a remote `src` rather than passing it through. Saying so to
        // the engine closes the gap between that intent and what the engine
        // would otherwise be willing to do with a definition — which matters
        // most on the server, where an outbound fetch would be ours to make.
        pdfMake.setUrlAccessPolicy(() => false);

        // Defined on the server subclass only; the browser build has no local
        // file system to reach and no such method. Guarded rather than assumed,
        // because the published type declares both unconditionally.
        if (typeof pdfMake.setLocalAccessPolicy === "function") {
            pdfMake.setLocalAccessPolicy(() => false);
        }

        return pdfMake;
    })();

    return engine;
}

async function loadPack(
    pdfMake: Engine,
    family: PdfFontFamily,
    load: FontFileLoader,
): Promise<void> {
    await Promise.all(
        packFiles(family).map(async (filename) => {
            // The engine's own file system is the record of what is loaded, so
            // there is no second copy of that fact to fall out of step with it.
            // A module-level `Set` beside a singleton is the shape that made
            // the UUID generator flaky, and this needs no more than pdfmake
            // already knows.
            if (pdfMake.virtualfs.existsSync(filename)) {
                return;
            }

            const bytes = await load(filename);

            pdfMake.virtualfs.writeFileSync(filename, bytesToBase64(bytes), "base64");
        }),
    );
}

export type PdfRenderFailure = "font_unavailable" | "engine_failed";

export type PdfRenderResult =
    | { readonly ok: true; readonly bytes: Uint8Array }
    | { readonly ok: false; readonly reason: PdfRenderFailure };

export async function renderPdfBytes(
    preparation: PdfPreparation,
    load: FontFileLoader,
): Promise<PdfRenderResult> {
    const pdfMake = await loadEngine();

    try {
        for (const family of preparation.packs) {
            await loadPack(pdfMake, family, load);
        }
    } catch {
        // A pack that will not load is its own refusal, and a recoverable one:
        // the reader can turn the document into a PDF with the glyphs missing,
        // or try again on a connection that works. Reporting it as a rendering
        // failure would hide which of those two it is.
        return { ok: false, reason: "font_unavailable" };
    }

    try {
        pdfMake.addFonts(preparation.fonts);
        pdfMake.addTableLayouts(preparation.layouts);

        const buffer = await pdfMake.createPdf(preparation.definition).getBuffer();

        // A `Buffer` may be a window onto a pooled allocation, so the offset
        // and length are named rather than assuming the view starts at zero.
        return {
            ok: true,
            bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
        };
    } catch {
        return { ok: false, reason: "engine_failed" };
    }
}
