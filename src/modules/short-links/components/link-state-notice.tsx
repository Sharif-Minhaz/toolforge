import { IconAlertTriangle } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";

import type { LinkState } from "../types";

/**
 * The banner a tool page shows when somebody arrives from a short link that had
 * nowhere to send them.
 *
 * A server component shared by both tools: the three outcomes a redirect can
 * refuse on — never existed, not live yet, already over — read the same
 * wherever the visitor landed, and none of them should be flattened into "not
 * found". Being told a link expired is the difference between "I mistyped it"
 * and "I need a new one".
 */
export async function LinkStateNotice({ state }: { state: LinkState }) {
    const t = await getTranslations("shortLinks.states");

    const copy = {
        missing: { title: t("missingTitle"), body: t("missingBody") },
        pending: { title: t("pendingTitle"), body: t("pendingBody") },
        expired: { title: t("expiredTitle"), body: t("expiredBody") },
    }[state];

    return (
        <div
            role="status"
            className="border-brand-amber/40 bg-brand-amber/8 flex items-start gap-2.5 rounded-xl border px-4 py-3"
        >
            <IconAlertTriangle
                className="text-brand-amber mt-0.5 size-4 shrink-0"
                stroke={1.9}
                aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-brand-amber text-[0.8125rem] leading-[1.4] font-medium">
                    {copy.title}
                </p>
                <p className="text-muted-foreground max-w-[60ch] text-[0.8125rem] leading-relaxed">
                    {copy.body}
                </p>
            </div>
        </div>
    );
}
