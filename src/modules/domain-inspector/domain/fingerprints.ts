import type { EvidenceSource, TechnologyCategory } from "../types";

/**
 * The signature table.
 *
 * Every published Wappalyzer-shaped library is either unmaintained — the
 * upstream `wappalyzer-core` package now says so in its own description — or
 * arrives with a headless DOM and an HTTP client attached. What is actually
 * needed is a list of patterns and something to run them, so that is what this
 * is: data in `domain/`, matched by a pure function, unit-tested against
 * fixtures rather than against the live web.
 *
 * Two rules keep it honest:
 *
 * - **Every entry carries a licence.** That is half the point of the panel: a
 *   reader deciding whether to build on what a site is built on needs to know
 *   that WordPress is GPL and Shopify is not. SPDX identifiers are proper
 *   names, so they are data here and never translated; `"Proprietary"` is the
 *   deliberate spelling for everything with no public licence.
 * - **No global flags on the patterns.** A `RegExp` with `g` carries
 *   `lastIndex` between calls, and this table is module-level state shared by
 *   every request the server handles.
 */

export type SignatureRule = {
    readonly source: EvidenceSource;
    /** Header or cookie name. Unused — and `undefined` — for the rest. */
    readonly key?: string;
    readonly pattern: RegExp;
};

export type TechnologySignature = {
    readonly id: string;
    /** A proper name, so it stays out of the message catalogue. */
    readonly name: string;
    readonly category: TechnologyCategory;
    /** SPDX identifier, or `"Proprietary"`. */
    readonly license: string;
    readonly rules: readonly SignatureRule[];
};

export const PROPRIETARY = "Proprietary";

/** SPDX publishes a page per identifier; nothing else needs a hand-written URL. */
export function licenseUrl(license: string): string | null {
    return license === PROPRIETARY ? null : `https://spdx.org/licenses/${license}.html`;
}

export const TECHNOLOGY_SIGNATURES: readonly TechnologySignature[] = [
    // ── Web servers ──────────────────────────────────────────────────────
    {
        id: "nginx",
        name: "nginx",
        category: "server",
        license: "BSD-2-Clause",
        rules: [{ source: "header", key: "server", pattern: /^nginx(?:\/([\d.]+))?/i }],
    },
    {
        id: "apache",
        name: "Apache HTTP Server",
        category: "server",
        license: "Apache-2.0",
        rules: [{ source: "header", key: "server", pattern: /^apache(?:\/([\d.]+))?/i }],
    },
    {
        id: "openresty",
        name: "OpenResty",
        category: "server",
        license: "BSD-2-Clause",
        rules: [{ source: "header", key: "server", pattern: /openresty(?:\/([\d.]+))?/i }],
    },
    {
        id: "caddy",
        name: "Caddy",
        category: "server",
        license: "Apache-2.0",
        rules: [{ source: "header", key: "server", pattern: /^caddy/i }],
    },
    {
        id: "envoy",
        name: "Envoy",
        category: "server",
        license: "Apache-2.0",
        rules: [{ source: "header", key: "server", pattern: /^envoy/i }],
    },
    {
        id: "litespeed",
        name: "LiteSpeed",
        category: "server",
        license: PROPRIETARY,
        rules: [{ source: "header", key: "server", pattern: /litespeed/i }],
    },
    {
        id: "iis",
        name: "Microsoft IIS",
        category: "server",
        license: PROPRIETARY,
        rules: [{ source: "header", key: "server", pattern: /microsoft-iis(?:\/([\d.]+))?/i }],
    },
    {
        id: "gunicorn",
        name: "Gunicorn",
        category: "server",
        license: "MIT",
        rules: [{ source: "header", key: "server", pattern: /gunicorn(?:\/([\d.]+))?/i }],
    },
    {
        id: "varnish",
        name: "Varnish",
        category: "server",
        license: "BSD-2-Clause",
        rules: [{ source: "header", key: "via", pattern: /varnish(?:\/([\d.]+))?/i }],
    },

    // ── CDN and edge ─────────────────────────────────────────────────────
    {
        id: "cloudflare",
        name: "Cloudflare",
        category: "cdn",
        license: PROPRIETARY,
        rules: [
            { source: "header", key: "cf-ray", pattern: /./ },
            { source: "header", key: "server", pattern: /^cloudflare$/i },
        ],
    },
    {
        id: "fastly",
        name: "Fastly",
        category: "cdn",
        license: PROPRIETARY,
        rules: [
            { source: "header", key: "x-fastly-request-id", pattern: /./ },
            { source: "header", key: "x-served-by", pattern: /^cache-/i },
        ],
    },
    {
        id: "akamai",
        name: "Akamai",
        category: "cdn",
        license: PROPRIETARY,
        rules: [
            { source: "header", key: "x-akamai-transformed", pattern: /./ },
            { source: "header", key: "server", pattern: /akamaighost/i },
        ],
    },
    {
        id: "cloudfront",
        name: "Amazon CloudFront",
        category: "cdn",
        license: PROPRIETARY,
        rules: [
            { source: "header", key: "x-amz-cf-id", pattern: /./ },
            { source: "header", key: "server", pattern: /^cloudfront$/i },
        ],
    },
    {
        id: "bunny",
        name: "Bunny CDN",
        category: "cdn",
        license: PROPRIETARY,
        rules: [{ source: "header", key: "server", pattern: /bunnycdn/i }],
    },
    {
        id: "sucuri",
        name: "Sucuri",
        category: "cdn",
        license: PROPRIETARY,
        rules: [{ source: "header", key: "x-sucuri-id", pattern: /./ }],
    },
    {
        id: "imperva",
        name: "Imperva",
        category: "cdn",
        license: PROPRIETARY,
        rules: [{ source: "header", key: "x-iinfo", pattern: /./ }],
    },

    // ── Hosting platforms ────────────────────────────────────────────────
    {
        id: "vercel",
        name: "Vercel",
        category: "hosting",
        license: PROPRIETARY,
        rules: [
            { source: "header", key: "x-vercel-id", pattern: /./ },
            { source: "header", key: "server", pattern: /^vercel$/i },
        ],
    },
    {
        id: "netlify",
        name: "Netlify",
        category: "hosting",
        license: PROPRIETARY,
        rules: [
            { source: "header", key: "x-nf-request-id", pattern: /./ },
            { source: "header", key: "server", pattern: /^netlify$/i },
        ],
    },
    {
        // Named for the company, not the product: github.com itself and a Pages
        // site both answer `Server: GitHub.com`, so calling every match "GitHub
        // Pages" would be a confident wrong answer half the time.
        id: "github",
        name: "GitHub",
        category: "hosting",
        license: PROPRIETARY,
        rules: [{ source: "header", key: "server", pattern: /^github\.com$/i }],
    },
    {
        id: "heroku",
        name: "Heroku",
        category: "hosting",
        license: PROPRIETARY,
        rules: [{ source: "header", key: "via", pattern: /vegur/i }],
    },
    {
        id: "amazon-s3",
        name: "Amazon S3",
        category: "hosting",
        license: PROPRIETARY,
        rules: [{ source: "header", key: "server", pattern: /^amazons3$/i }],
    },
    {
        id: "fly-io",
        name: "Fly.io",
        category: "hosting",
        license: PROPRIETARY,
        rules: [{ source: "header", key: "fly-request-id", pattern: /./ }],
    },
    {
        id: "render",
        name: "Render",
        category: "hosting",
        license: PROPRIETARY,
        rules: [{ source: "header", key: "x-render-origin-server", pattern: /./ }],
    },

    // ── DNS operators, read off the delegation ───────────────────────────
    {
        id: "cloudflare-dns",
        name: "Cloudflare DNS",
        category: "dns",
        license: PROPRIETARY,
        rules: [{ source: "ns", pattern: /\.ns\.cloudflare\.com$/i }],
    },
    {
        id: "route-53",
        name: "Amazon Route 53",
        category: "dns",
        license: PROPRIETARY,
        rules: [{ source: "ns", pattern: /\.awsdns-\d+\.(?:com|net|org|co\.uk)$/i }],
    },
    {
        id: "google-cloud-dns",
        name: "Google Cloud DNS",
        category: "dns",
        license: PROPRIETARY,
        rules: [{ source: "ns", pattern: /^ns-cloud-[a-z]\d\.googledomains\.com$/i }],
    },
    {
        id: "azure-dns",
        name: "Azure DNS",
        category: "dns",
        license: PROPRIETARY,
        rules: [{ source: "ns", pattern: /\.azure-dns\.(?:com|net|org|info)$/i }],
    },
    {
        id: "digitalocean-dns",
        name: "DigitalOcean DNS",
        category: "dns",
        license: PROPRIETARY,
        rules: [{ source: "ns", pattern: /\.digitalocean\.com$/i }],
    },
    {
        id: "godaddy-dns",
        name: "GoDaddy DNS",
        category: "dns",
        license: PROPRIETARY,
        rules: [{ source: "ns", pattern: /\.domaincontrol\.com$/i }],
    },
    {
        id: "vercel-dns",
        name: "Vercel DNS",
        category: "dns",
        license: PROPRIETARY,
        rules: [{ source: "ns", pattern: /\.vercel-dns\.com$/i }],
    },
    {
        id: "nsone",
        name: "NS1",
        category: "dns",
        license: PROPRIETARY,
        rules: [{ source: "ns", pattern: /\.nsone\.net$/i }],
    },

    // ── Content management ───────────────────────────────────────────────
    {
        id: "wordpress",
        name: "WordPress",
        category: "cms",
        license: "GPL-2.0-or-later",
        rules: [
            { source: "generator", pattern: /wordpress(?:\s+([\d.]+))?/i },
            { source: "html", pattern: /\/wp-(?:content|includes)\// },
        ],
    },
    {
        id: "drupal",
        name: "Drupal",
        category: "cms",
        license: "GPL-2.0-or-later",
        rules: [
            { source: "header", key: "x-generator", pattern: /drupal(?:\s+(\d+))?/i },
            { source: "generator", pattern: /drupal(?:\s+(\d+))?/i },
        ],
    },
    {
        id: "joomla",
        name: "Joomla",
        category: "cms",
        license: "GPL-2.0-or-later",
        rules: [{ source: "generator", pattern: /joomla!?(?:\s*([\d.]+))?/i }],
    },
    {
        id: "typo3",
        name: "TYPO3",
        category: "cms",
        license: "GPL-2.0-or-later",
        rules: [{ source: "generator", pattern: /typo3(?:\s+([\d.]+))?/i }],
    },
    {
        id: "ghost",
        name: "Ghost",
        category: "cms",
        license: "MIT",
        rules: [{ source: "generator", pattern: /ghost(?:\s+([\d.]+))?/i }],
    },
    {
        id: "webflow",
        name: "Webflow",
        category: "cms",
        license: PROPRIETARY,
        rules: [{ source: "generator", pattern: /webflow/i }],
    },
    {
        id: "wix",
        name: "Wix",
        category: "cms",
        license: PROPRIETARY,
        rules: [
            { source: "header", key: "x-wix-request-id", pattern: /./ },
            { source: "html", pattern: /static\.parastorage\.com/ },
        ],
    },
    {
        id: "squarespace",
        name: "Squarespace",
        category: "cms",
        license: PROPRIETARY,
        rules: [
            { source: "generator", pattern: /squarespace/i },
            { source: "html", pattern: /static1\.squarespace\.com/ },
        ],
    },
    {
        id: "hubspot",
        name: "HubSpot",
        category: "cms",
        license: PROPRIETARY,
        rules: [{ source: "html", pattern: /(?:js|cdn)\.hs(?:-scripts|forms|static)?\.com/ }],
    },

    // ── Commerce ─────────────────────────────────────────────────────────
    {
        id: "shopify",
        name: "Shopify",
        category: "ecommerce",
        license: PROPRIETARY,
        rules: [
            { source: "header", key: "x-shopify-stage", pattern: /./ },
            { source: "html", pattern: /cdn\.shopify\.com/ },
        ],
    },
    {
        id: "woocommerce",
        name: "WooCommerce",
        category: "ecommerce",
        license: "GPL-3.0-or-later",
        rules: [{ source: "html", pattern: /woocommerce(?:[-.]([\d.]+))?/i }],
    },
    {
        id: "magento",
        name: "Magento",
        category: "ecommerce",
        license: "OSL-3.0",
        rules: [
            { source: "cookie", key: "x-magento-vary", pattern: /./ },
            { source: "html", pattern: /\/static\/version\d+\/frontend\// },
        ],
    },
    {
        id: "prestashop",
        name: "PrestaShop",
        category: "ecommerce",
        license: "OSL-3.0",
        rules: [{ source: "generator", pattern: /prestashop/i }],
    },
    {
        id: "bigcommerce",
        name: "BigCommerce",
        category: "ecommerce",
        license: PROPRIETARY,
        rules: [{ source: "html", pattern: /cdn\d*\.bigcommerce\.com/ }],
    },

    // ── Application frameworks ───────────────────────────────────────────
    {
        id: "next-js",
        name: "Next.js",
        category: "framework",
        license: "MIT",
        rules: [
            { source: "header", key: "x-powered-by", pattern: /^next\.js(?:\s+([\d.]+))?/i },
            { source: "html", pattern: /\/_next\/static\// },
        ],
    },
    {
        id: "nuxt",
        name: "Nuxt",
        category: "framework",
        license: "MIT",
        rules: [{ source: "html", pattern: /(?:__NUXT__|\/_nuxt\/)/ }],
    },
    {
        id: "astro",
        name: "Astro",
        category: "framework",
        license: "MIT",
        rules: [{ source: "generator", pattern: /astro\s+v?([\d.]+)?/i }],
    },
    {
        id: "sveltekit",
        name: "SvelteKit",
        category: "framework",
        license: "MIT",
        rules: [{ source: "html", pattern: /\/_app\/immutable\// }],
    },
    {
        id: "remix",
        name: "Remix",
        category: "framework",
        license: "MIT",
        rules: [{ source: "html", pattern: /__remixContext/ }],
    },
    {
        id: "gatsby",
        name: "Gatsby",
        category: "framework",
        license: "MIT",
        rules: [
            { source: "generator", pattern: /gatsby(?:\s+([\d.]+))?/i },
            { source: "html", pattern: /___gatsby/ },
        ],
    },
    {
        id: "express",
        name: "Express",
        category: "framework",
        license: "MIT",
        rules: [{ source: "header", key: "x-powered-by", pattern: /^express/i }],
    },
    {
        id: "laravel",
        name: "Laravel",
        category: "framework",
        license: "MIT",
        rules: [{ source: "cookie", key: "laravel_session", pattern: /./ }],
    },
    {
        id: "django",
        name: "Django",
        category: "framework",
        license: "BSD-3-Clause",
        rules: [
            { source: "cookie", key: "csrftoken", pattern: /./ },
            { source: "html", pattern: /csrfmiddlewaretoken/ },
        ],
    },
    {
        id: "rails",
        name: "Ruby on Rails",
        category: "framework",
        license: "MIT",
        rules: [{ source: "html", pattern: /name="csrf-param"\s+content="authenticity_token"/ }],
    },
    {
        id: "asp-net",
        name: "ASP.NET",
        category: "framework",
        license: "MIT",
        rules: [
            { source: "header", key: "x-aspnet-version", pattern: /([\d.]+)/ },
            { source: "header", key: "x-powered-by", pattern: /asp\.net/i },
        ],
    },
    {
        id: "php",
        name: "PHP",
        category: "framework",
        license: "PHP-3.01",
        rules: [{ source: "header", key: "x-powered-by", pattern: /^php\/([\d.]+)/i }],
    },

    // ── Client-side libraries ────────────────────────────────────────────
    {
        id: "react",
        name: "React",
        category: "javascript",
        license: "MIT",
        rules: [
            { source: "html", pattern: /data-reactroot|__REACT_DEVTOOLS|__NEXT_DATA__/ },
            { source: "html", pattern: /react(?:-dom)?[@.-]([\d.]+)?(?:\.min)?\.js/i },
        ],
    },
    {
        id: "vue",
        name: "Vue.js",
        category: "javascript",
        license: "MIT",
        rules: [
            { source: "html", pattern: /__VUE__|data-v-[0-9a-f]{8}/ },
            { source: "html", pattern: /vue(?:@|[.-])([\d.]+)?(?:\.min)?\.js/i },
        ],
    },
    {
        id: "angular",
        name: "Angular",
        category: "javascript",
        license: "MIT",
        rules: [{ source: "html", pattern: /ng-version="([\d.]+)"/ }],
    },
    {
        id: "jquery",
        name: "jQuery",
        category: "javascript",
        license: "MIT",
        rules: [{ source: "html", pattern: /jquery[@.-]?([\d.]+)?(?:\.slim)?(?:\.min)?\.js/i }],
    },
    {
        id: "alpine",
        name: "Alpine.js",
        category: "javascript",
        license: "MIT",
        rules: [{ source: "html", pattern: /alpinejs[@.\/-]?([\d.]+)?/i }],
    },
    {
        id: "htmx",
        name: "htmx",
        category: "javascript",
        license: "BSD-2-Clause",
        rules: [{ source: "html", pattern: /htmx(?:\.org)?[@.\/-]?([\d.]+)?(?:\.min)?\.js/i }],
    },
    {
        id: "bootstrap",
        name: "Bootstrap",
        category: "javascript",
        license: "MIT",
        rules: [{ source: "html", pattern: /bootstrap[@.\/-]?([\d.]+)?(?:\.min)?\.(?:css|js)/i }],
    },
    {
        id: "tailwind",
        name: "Tailwind CSS",
        category: "javascript",
        license: "MIT",
        rules: [{ source: "html", pattern: /(?:cdn\.)?tailwindcss(?:\.com)?/i }],
    },

    // ── Measurement ──────────────────────────────────────────────────────
    {
        id: "google-analytics",
        name: "Google Analytics",
        category: "analytics",
        license: PROPRIETARY,
        rules: [
            { source: "html", pattern: /googletagmanager\.com\/gtag\/js/ },
            { source: "html", pattern: /google-analytics\.com\/analytics\.js/ },
        ],
    },
    {
        id: "google-tag-manager",
        name: "Google Tag Manager",
        category: "analytics",
        license: PROPRIETARY,
        rules: [{ source: "html", pattern: /googletagmanager\.com\/gtm\.js/ }],
    },
    {
        id: "plausible",
        name: "Plausible Analytics",
        category: "analytics",
        license: "AGPL-3.0-only",
        rules: [{ source: "html", pattern: /plausible\.io\/js/ }],
    },
    {
        id: "umami",
        name: "Umami",
        category: "analytics",
        license: "MIT",
        rules: [{ source: "html", pattern: /umami[^"']*\/script\.js/ }],
    },
    {
        id: "matomo",
        name: "Matomo",
        category: "analytics",
        license: "GPL-3.0-or-later",
        rules: [{ source: "html", pattern: /(?:matomo|piwik)\.js/ }],
    },
    {
        id: "posthog",
        name: "PostHog",
        category: "analytics",
        license: "MIT",
        rules: [{ source: "html", pattern: /posthog(?:-js)?[^"']*\.js|app\.posthog\.com/ }],
    },
    {
        id: "hotjar",
        name: "Hotjar",
        category: "analytics",
        license: PROPRIETARY,
        rules: [{ source: "html", pattern: /static\.hotjar\.com/ }],
    },
    {
        id: "segment",
        name: "Segment",
        category: "analytics",
        license: PROPRIETARY,
        rules: [{ source: "html", pattern: /cdn\.segment\.(?:com|io)/ }],
    },
    {
        id: "clarity",
        name: "Microsoft Clarity",
        category: "analytics",
        license: PROPRIETARY,
        rules: [{ source: "html", pattern: /clarity\.ms/ }],
    },
    {
        id: "cloudflare-insights",
        name: "Cloudflare Web Analytics",
        category: "analytics",
        license: PROPRIETARY,
        rules: [{ source: "html", pattern: /static\.cloudflareinsights\.com/ }],
    },

    // ── Challenge and bot defence ────────────────────────────────────────
    {
        id: "recaptcha",
        name: "reCAPTCHA",
        category: "security",
        license: PROPRIETARY,
        rules: [{ source: "html", pattern: /www\.google\.com\/recaptcha/ }],
    },
    {
        id: "turnstile",
        name: "Cloudflare Turnstile",
        category: "security",
        license: PROPRIETARY,
        rules: [{ source: "html", pattern: /challenges\.cloudflare\.com\/turnstile/ }],
    },
    {
        id: "hcaptcha",
        name: "hCaptcha",
        category: "security",
        license: PROPRIETARY,
        rules: [{ source: "html", pattern: /(?:js|newassets)\.hcaptcha\.com/ }],
    },

    // ── Mail, read off the MX delegation ─────────────────────────────────
    {
        id: "google-workspace",
        name: "Google Workspace",
        category: "mail",
        license: PROPRIETARY,
        rules: [{ source: "mx", pattern: /aspmx.*\.google\.com$|\.googlemail\.com$/i }],
    },
    {
        id: "microsoft-365",
        name: "Microsoft 365",
        category: "mail",
        license: PROPRIETARY,
        rules: [{ source: "mx", pattern: /\.mail\.protection\.outlook\.com$/i }],
    },
    {
        id: "zoho-mail",
        name: "Zoho Mail",
        category: "mail",
        license: PROPRIETARY,
        rules: [{ source: "mx", pattern: /\.zoho(?:cloud)?\.(?:com|eu|in)$/i }],
    },
    {
        id: "proton-mail",
        name: "Proton Mail",
        category: "mail",
        license: PROPRIETARY,
        rules: [{ source: "mx", pattern: /\.protonmail\.ch$|\.protonmail\.com$/i }],
    },
    {
        id: "fastmail",
        name: "Fastmail",
        category: "mail",
        license: PROPRIETARY,
        rules: [{ source: "mx", pattern: /\.messagingengine\.com$/i }],
    },
    {
        id: "icloud-mail",
        name: "iCloud Mail",
        category: "mail",
        license: PROPRIETARY,
        rules: [{ source: "mx", pattern: /\.icloud\.com$/i }],
    },
    {
        id: "amazon-ses",
        name: "Amazon SES",
        category: "mail",
        license: PROPRIETARY,
        rules: [{ source: "mx", pattern: /\.amazonses\.com$/i }],
    },
    {
        id: "mailgun",
        name: "Mailgun",
        category: "mail",
        license: PROPRIETARY,
        rules: [{ source: "mx", pattern: /\.mailgun\.org$/i }],
    },
    {
        id: "yandex-mail",
        name: "Yandex Mail",
        category: "mail",
        license: PROPRIETARY,
        rules: [{ source: "mx", pattern: /\.yandex\.(?:net|ru)$/i }],
    },
];
