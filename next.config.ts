import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Locale is resolved from a cookie rather than a URL segment, so tool routes
// stay canonical (`/tools/uuid`, not `/en/tools/uuid`).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
    reactCompiler: true,
};

export default withNextIntl(nextConfig);
