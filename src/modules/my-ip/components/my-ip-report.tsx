import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { RESULT_TRAY } from "@/modules/tools/components/workbench-step";
import type { VisitorRequest } from "../types";
import { CopyValueButton } from "./copy-value-button";
import { DetailList } from "./detail-list";

export const REPORT_CARD =
    "bg-card ring-border/70 flex min-w-0 flex-col gap-5 rounded-xl p-5 ring-1 ring-inset sm:p-6";

type MyIpReportProps = {
    request: VisitorRequest;
    /** The network panel, streamed in its own Suspense boundary. */
    network: ReactNode;
};

/** The request-time card: the address, what the browser sent, and the network behind it. */
export async function MyIpReport({ request, network }: MyIpReportProps) {
    const [t, tFields] = await Promise.all([
        getTranslations("myIp.report"),
        getTranslations("myIp.fields"),
    ]);
    const { address } = request;
    const notSent = <span className="text-muted-foreground font-sans italic">{t("notSent")}</span>;

    return (
        <div className={REPORT_CARD}>
            <div className="flex min-w-0 flex-col gap-2">
                <p className="text-muted-foreground text-xs font-medium">{t("addressLabel")}</p>

                {address === null ? (
                    <StatusStrip tone="error" message={t("missing")} />
                ) : (
                    <>
                        <div className="flex min-w-0 items-center gap-2">
                            <p className="min-w-0 font-mono text-2xl leading-tight font-semibold tracking-tight break-all sm:text-4xl">
                                {address.ip}
                            </p>
                            <CopyValueButton value={address.ip} label={t("copyAddress")} />
                            {address.version !== null && (
                                <Badge variant="secondary" className="shrink-0">
                                    {`IPv${address.version}`}
                                </Badge>
                            )}
                        </div>
                        {address.scope !== "public" && (
                            <StatusStrip tone="warning" message={t(address.scope)} />
                        )}
                    </>
                )}
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <section aria-labelledby="my-ip-request-title" className={RESULT_TRAY}>
                    <h2 id="my-ip-request-title" className="text-sm font-semibold">
                        {t("requestTitle")}
                    </h2>
                    <DetailList
                        copyLabel={(label) => t("copyValue", { label })}
                        items={request.details.map(({ field, header, value }) => ({
                            key: field,
                            label: tFields(field),
                            hint: header,
                            value: value ?? notSent,
                            copyValue: value,
                        }))}
                    />
                </section>

                {network}
            </div>
        </div>
    );
}
