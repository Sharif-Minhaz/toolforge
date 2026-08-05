"use client";

import { IconBraces, IconFileTypeXml, IconLoader2 } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { saveFile } from "@/modules/tools/domain/file-saver";

import { exportServerBundle } from "../actions/bundle";
import { exportOpenApi } from "../actions/openapi";

type ServerExportProps = {
    workspaceId: string;
    serverId: string;
    /** The public origin, needed for OpenAPI's `servers` entry. */
    origin: string;
};

type Format = "bundle" | "openapi";

/**
 * Two exports, and they answer different questions.
 *
 * The **bundle** is everything this studio knows about a server, in the shape it
 * knows it: every route and its whole graph, so the file can be committed,
 * diffed and put back. **OpenAPI** describes the API to other tools and is lossy
 * on purpose — a value tree that generates a different name per call has no
 * OpenAPI spelling, so it goes out as one example.
 *
 * Offering both, labelled with what each loses, is the honest version. Offering
 * only OpenAPI would quietly turn a backup into a snapshot of one response.
 */
export function ServerExport({ workspaceId, serverId, origin }: ServerExportProps) {
    const t = useTranslations("mockServer.export");
    const [running, setRunning] = useState<Format | null>(null);
    const [, startTransition] = useTransition();

    function download(format: Format) {
        setRunning(format);

        startTransition(async () => {
            const result =
                format === "bundle"
                    ? await exportServerBundle({ workspaceId, serverId })
                    : await exportOpenApi({ workspaceId, serverId, baseUrl: origin });

            setRunning(null);

            if (!result.ok) {
                toast.error(t("failed"));

                return;
            }

            saveFile({
                filename: result.filename,
                // `charset` is explicit because a graph may hold any text a
                // reader typed, and a browser guessing the encoding of a
                // downloaded file guesses Latin-1 more often than it should.
                mimeType: "application/json;charset=utf-8",
                content: result.document,
            });
            toast.success(t("downloaded"));
        });
    }

    return (
        <section
            aria-labelledby="export-heading"
            className="border-border/70 bg-card rounded-2xl border p-4 shadow-xs"
        >
            <h2 id="export-heading" className="text-foreground text-sm leading-[1.3] font-semibold">
                {t("title")}
            </h2>
            <p className="text-muted-foreground mt-1 max-w-[68ch] text-xs leading-relaxed">
                {t("subtitle")}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
                <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={running !== null}
                    onClick={() => download("bundle")}
                >
                    {running === "bundle" ? (
                        <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <IconBraces className="size-4" aria-hidden="true" />
                    )}
                    {t("bundleAction")}
                </Button>

                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={running !== null}
                    onClick={() => download("openapi")}
                >
                    {running === "openapi" ? (
                        <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <IconFileTypeXml className="size-4" aria-hidden="true" />
                    )}
                    {t("openApiAction")}
                </Button>
            </div>

            <p className="text-muted-foreground mt-2.5 max-w-[68ch] text-[0.6875rem] leading-normal">
                {t("formatsHint")}
            </p>
        </section>
    );
}
