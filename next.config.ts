import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Locale is resolved from a cookie rather than a URL segment, so tool routes
// stay canonical (`/tools/uuid`, not `/en/tools/uuid`).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
    reactCompiler: true,
    // Text to Speech's client opens a WebSocket through `ws`, whose optional
    // native add-ons (`bufferutil`, `utf-8-validate`) are resolved with a
    // runtime `require` a bundler cannot follow. Left external, Node loads the
    // package from `node_modules` as its authors expect.
    serverExternalPackages: ["msedge-tts"],
    experimental: {
        serverActions: {
            // The Watermark Remover forwards the original file to its worker,
            // which accepts up to 10 MB. The default 1 MB would reject most
            // phone photographs before the action ever ran; the extra megabyte
            // covers the multipart boundaries and part headers on top of the
            // payload. Every other action in the app sends a small object.
            bodySizeLimit: "11mb",
        },
    },
};

export default withNextIntl(nextConfig);
