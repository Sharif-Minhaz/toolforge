"use client";

import { IconBraces, IconDownload, IconFileTypeXml, IconLoader2 } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
            className="border-border/70 bg-card rounded-2xl border p-4 shadow-xs sm:p-5"
        >
            <h2 id="export-heading" className="text-foreground text-sm leading-[1.3] font-semibold">
                {t("title")}
            </h2>
            <p className="text-muted-foreground mt-1 max-w-[68ch] text-xs leading-relaxed">
                {t("subtitle")}
            </p>

            {/*
             * One card per format rather than two buttons over a shared
             * paragraph.
             *
             * The paragraph described both formats in sequence and left the
             * reader to map its first sentence onto the first button and its
             * second onto the second — which is work, and is why the block read
             * as a wall of text with two controls stranded above it. Splitting
             * it puts each caveat beside the button it constrains, and gives the
             * card's width something to do besides run out.
             */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FormatCard
                    icon={<IconBraces className="size-4" aria-hidden="true" />}
                    tone="bg-brand-violet/12 text-brand-violet"
                    title={t("bundleTitle")}
                    hint={t("bundleHint")}
                    action={t("bundleAction")}
                    busy={running === "bundle"}
                    disabled={running !== null}
                    onDownload={() => download("bundle")}
                />

                <FormatCard
                    icon={<IconFileTypeXml className="size-4" aria-hidden="true" />}
                    tone="bg-brand-cyan/12 text-brand-cyan"
                    title={t("openApiTitle")}
                    hint={t("openApiHint")}
                    action={t("openApiAction")}
                    busy={running === "openapi"}
                    disabled={running !== null}
                    onDownload={() => download("openapi")}
                />
            </div>
        </section>
    );
}

type FormatCardProps = {
    icon: React.ReactNode;
    /** Background and foreground for the icon tile, from the brand hues. */
    tone: string;
    title: string;
    hint: string;
    action: string;
    busy: boolean;
    disabled: boolean;
    onDownload: () => void;
};

function FormatCard({
    icon,
    tone,
    title,
    hint,
    action,
    busy,
    disabled,
    onDownload,
}: FormatCardProps) {
    return (
        // `h-full` plus `mt-auto` on the button is what keeps the two buttons on
        // one line when the descriptions differ in length — the difference
        // between a deliberate pair and two boxes that happen to sit together.
        <div className="border-border/70 bg-muted/25 flex h-full min-w-0 flex-col gap-2 rounded-xl border p-3.5">
            <div className="flex min-w-0 items-center gap-2">
                <span
                    className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg",
                        tone,
                    )}
                    aria-hidden="true"
                >
                    {icon}
                </span>
                <h3 className="text-foreground min-w-0 flex-1 text-xs leading-[1.3] font-medium">
                    {title}
                </h3>
            </div>

            <p className="text-muted-foreground text-[0.6875rem] leading-relaxed">{hint}</p>

            <Button
                type="button"
                size="sm"
                variant="outline"
                // Neither format is the recommended one — they answer different
                // questions — so they carry the same weight. The filled/outline
                // pair this replaced read as a recommendation nobody made.
                className="mt-auto w-fit cursor-pointer gap-1.5"
                disabled={disabled}
                onClick={onDownload}
            >
                {busy ? (
                    <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                    <IconDownload className="size-4" aria-hidden="true" />
                )}
                {action}
            </Button>
        </div>
    );
}
