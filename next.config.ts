import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Locale is resolved from a cookie rather than a URL segment, so tool routes
// stay canonical (`/tools/uuid`, not `/en/tools/uuid`).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
    reactCompiler: true,
    experimental: {
        serverActions: {
            // The AI Image Detector forwards the original file to its worker,
            // which accepts up to 10 MB. The default 1 MB would reject most
            // phone photographs before the action ever ran; the extra megabyte
            // covers the multipart boundaries and part headers on top of the
            // payload. Every other action in the app sends a small object.
            bodySizeLimit: "11mb",
        },
    },
};

export default withNextIntl(nextConfig);
