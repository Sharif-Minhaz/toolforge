/**
 * Runs after `next build` (see `package.json`): lists every file the build put
 * under `.next/static` and writes `public/sw-manifest.js`, which the service
 * worker precaches when the app is installed. Vercel collects `public/` after
 * the build command, so the generated file deploys with the build it describes.
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import {
    buildPrecacheManifest,
    serializePrecacheManifest,
    SERVICE_WORKER_MANIFEST_FILE,
} from "@/modules/pwa/domain/precache";

const root = join(import.meta.dir, "..");
const staticDir = join(root, ".next", "static");

const version = (await readFile(join(root, ".next", "BUILD_ID"), "utf8")).trim();
const files = (await readdir(staticDir, { recursive: true })).map((file) => String(file));
const staticFiles: string[] = [];

for (const file of files) {
    if ((await stat(join(staticDir, file))).isFile()) {
        staticFiles.push(relative(staticDir, join(staticDir, file)).split(sep).join("/"));
    }
}

const manifest = buildPrecacheManifest(version, staticFiles.toSorted());

await writeFile(
    join(root, "public", SERVICE_WORKER_MANIFEST_FILE),
    serializePrecacheManifest(manifest),
);

process.stdout.write(
    `sw-manifest: ${manifest.assets.length} assets, ${manifest.pages.length} pages (build ${version})\n`,
);
