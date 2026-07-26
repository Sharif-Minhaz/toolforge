import { getRequestConfig } from "next-intl/server";

import { isLocale } from "./config";
import { getUserLocale } from "./locale";

export default getRequestConfig(async ({ locale }) => {
    // An explicit locale (e.g. from `getTranslations({locale})` during static
    // asset generation) wins, so those paths never touch request cookies.
    const resolved = isLocale(locale) ? locale : await getUserLocale();

    return {
        locale: resolved,
        // Fixed zone keeps server and client formatting identical regardless of
        // where the app is deployed.
        timeZone: "UTC",
        messages: (await import(`../messages/${resolved}.json`)).default,
    };
});
