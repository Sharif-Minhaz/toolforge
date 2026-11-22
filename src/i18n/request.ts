import { getRequestConfig } from "next-intl/server";

import { isLocale } from "./config";
import { getUserLocale } from "./locale";

export default getRequestConfig(async ({ locale, requestLocale }) => {
    // An explicit locale (e.g. from `getTranslations({locale})`) wins. Pages pin
    // theirs with `enterLocale`, so a prerender never touches request cookies.
    // Only what renders outside `app/[locale]` — a Server Action, a route
    // handler, the manifest — falls through to reading the cookie.
    const routed = isLocale(locale) ? locale : await requestLocale;
    const resolved = isLocale(routed) ? routed : await getUserLocale();

    return {
        locale: resolved,
        // Fixed zone keeps server and client formatting identical regardless of
        // where the app is deployed.
        timeZone: "UTC",
        messages: (await import(`../messages/${resolved}.json`)).default,
    };
});
