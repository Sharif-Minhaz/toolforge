import { getTranslations } from "next-intl/server";

import { absoluteUrl } from "@/modules/seo/domain/site";
import { REPORT_CARD } from "./my-ip-report";
import { DetailList } from "./detail-list";

/**
 * The same answer for a terminal, from `/api/ip`. Static, so it sits in the
 * prerendered shell rather than the request-time section.
 */
export async function MyIpCommandLine() {
    const t = await getTranslations("myIp.cli");
    const commands = [
        { key: "text", command: `curl ${absoluteUrl("/api/ip")}` },
        { key: "json", command: `curl "${absoluteUrl("/api/ip?format=json")}"` },
    ] as const;

    return (
        <section aria-labelledby="my-ip-cli-title" className={REPORT_CARD}>
            <h2 id="my-ip-cli-title" className="text-sm font-semibold">
                {t("title")}
            </h2>
            <DetailList
                copyLabel={() => t("copy")}
                items={commands.map(({ key, command }) => ({
                    key,
                    label: t(key),
                    value: command,
                    copyValue: command,
                }))}
            />
        </section>
    );
}
