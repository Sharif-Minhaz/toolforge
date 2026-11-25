import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    buildPrecacheManifest,
    isPrecachedAsset,
    OFFLINE_PATH,
    offlinePagePaths,
    PUBLIC_PRECACHE,
    serializePrecacheManifest,
} from "@/modules/pwa/domain/precache";
import { needsNetwork } from "@/modules/tools/domain/network";
import { getOfflineTools, getTools } from "@/modules/tools/domain/tool-catalog";

describe("offlinePagePaths", () => {
    const paths = offlinePagePaths();

    test("keeps the overview, the fallback and every browser or hybrid tool", () => {
        expect(paths).toContain("/");
        expect(paths).toContain(OFFLINE_PATH);
        expect(paths).toContain("/tools/uuid");
        expect(paths).toContain("/tools/image-converter");
    });

    test("never keeps a tool that needs the server, a section, or a planned tool", () => {
        for (const tool of getTools()) {
            if (needsNetwork(tool) || tool.isSection === true || tool.status !== "available") {
                expect(paths).not.toContain(tool.href);
            }
        }
    });

    test("lists each offline tool once", () => {
        expect(new Set(paths).size).toBe(paths.length);
        expect(getOfflineTools().length).toBeGreaterThan(0);
    });
});

describe("isPrecachedAsset", () => {
    test("keeps chunks, styles, fonts and codecs", () => {
        for (const path of [
            "chunks/0abc.js",
            "chunks/1def.css",
            "media/inter.woff2",
            "media/avif_enc.10_zpntngbd3m.wasm",
            "media/json-worker.2a7gacxury5u-.ts",
        ]) {
            expect(isPrecachedAsset(path)).toBe(true);
        }
    });

    test("skips source maps, legacy fonts and ONNX Runtime's binaries", () => {
        for (const path of [
            "chunks/2z3sh82dl8glu.js.map",
            "media/KaTeX_Main-Italic.2hkw3230mfwcv.ttf",
            "media/KaTeX_Main-Italic.abc.woff",
            "media/ort.node.min.0xc5vqd53ye-c.mjs",
            "media/ort-wasm-simd-threaded.jsep.10nw5y126-toc.wasm",
        ]) {
            expect(isPrecachedAsset(path)).toBe(false);
        }
    });
});

describe("buildPrecacheManifest", () => {
    test("prefixes build files, appends public files, and serialises for importScripts", () => {
        const manifest = buildPrecacheManifest("build-1", ["chunks/a.js", "chunks/a.js.map"]);

        expect(manifest.version).toBe("build-1");
        expect(manifest.assets).toEqual(["/_next/static/chunks/a.js", ...PUBLIC_PRECACHE]);
        expect(serializePrecacheManifest(manifest)).toStartWith("self.__PRECACHE = {");
    });

    test("every public file it lists exists, or the worker's warm would never finish", () => {
        const publicDir = join(import.meta.dir, "..", "..", "..", "..", "public");

        for (const url of PUBLIC_PRECACHE) {
            if (url !== "/manifest.webmanifest") {
                expect(existsSync(join(publicDir, url))).toBe(true);
            }
        }
    });
});
