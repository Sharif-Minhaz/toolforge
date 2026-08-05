"use client";

import {
    IconArrowRight,
    IconLoader2,
    IconPlayerPause,
    IconPlus,
    IconTrash,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";

import { createServer, deleteServer } from "../actions/servers";
import { MAX_SERVERS_PER_WORKSPACE } from "../domain/constants";
import { suggestServerKey } from "../domain/server-key";
import type { ServerFailureReason, ServerSummary } from "../types";
import { MockUrl } from "./mock-url";

type ServerGridProps = {
    workspaceId: string;
    servers: readonly ServerSummary[];
    /** Rendered so the reader can copy a callable address, not built here. */
    origin: string;
};

/**
 * The list of a workspace's mock servers, and the form that adds one.
 *
 * The key field is the interesting control. It is optional — blank draws one
 * from the name — and it is what appears in every address anybody shares, so
 * the form shows the resulting URL as it is typed rather than after the server
 * exists. A key that turns out to be taken is a real outcome rather than an
 * exceptional one: two people naming a server `payments` is the ordinary case.
 */
export function ServerGrid({ workspaceId, servers, origin }: ServerGridProps) {
    const t = useTranslations("mockServer.servers");
    const tErrors = useTranslations("mockServer.serverErrors");
    const tToast = useTranslations("mockServer.toast");
    const router = useRouter();

    const nameId = useId();
    const keyId = useId();

    const [rows, setRows] = useState<readonly ServerSummary[]>(servers);
    const [name, setName] = useState("");
    const [key, setKey] = useState("");
    const [failure, setFailure] = useState<ServerFailureReason | null>(null);
    const [armed, setArmed] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const hasRoom = rows.length < MAX_SERVERS_PER_WORKSPACE;
    // Shown live so the address is never a surprise after the fact.
    const previewKey = key.trim() === "" ? suggestServerKey(name) : key.trim();

    function submit() {
        if (!hasRoom || pending || name.trim() === "") {
            return;
        }

        setFailure(null);

        startTransition(async () => {
            const result = await createServer({ workspaceId, name, key });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setRows((held) => [...held, result.server]);
            setName("");
            setKey("");
            toast.success(tToast("serverCreated"));
            router.refresh();
        });
    }

    function remove(serverId: string) {
        startTransition(async () => {
            const result = await deleteServer({ serverId });

            if (!result.ok) {
                setFailure(result.reason);
                setArmed(null);

                return;
            }

            setRows((held) => held.filter((row) => row.id !== serverId));
            setArmed(null);
            toast.success(tToast("serverDeleted"));
            router.refresh();
        });
    }

    const status: { tone: StatusTone; message: string } | null =
        failure !== null
            ? { tone: "error", message: tErrors(failure) }
            : !hasRoom
              ? { tone: "warning", message: t("limitHint", { max: MAX_SERVERS_PER_WORKSPACE }) }
              : null;

    return (
        <div className="flex flex-col gap-6">
            <section aria-labelledby="servers-heading">
                <h2
                    id="servers-heading"
                    className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase"
                >
                    {t("heading")}
                </h2>

                {rows.length === 0 ? (
                    <p className="border-border/70 text-muted-foreground mt-3 rounded-2xl border border-dashed p-6 text-center text-xs leading-relaxed">
                        {t("empty")}
                        <span className="text-muted-foreground/70 mt-1 block">
                            {t("emptyHint")}
                        </span>
                    </p>
                ) : (
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                        {rows.map((server) => (
                            <li
                                key={server.id}
                                className="border-border/70 bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-xs"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <h3 className="text-foreground truncate text-sm leading-[1.3] font-semibold">
                                            {server.name}
                                        </h3>
                                        <p className="text-muted-foreground mt-0.5 text-xs leading-[1.4]">
                                            {t("endpointCount", { count: server.endpointCount })}
                                        </p>
                                    </div>
                                    {server.isPaused ? (
                                        <span className="bg-brand-amber/12 text-brand-amber flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[0.625rem] leading-[1.3] font-medium">
                                            <IconPlayerPause
                                                className="size-3"
                                                stroke={2}
                                                aria-hidden="true"
                                            />
                                            {t("paused")}
                                        </span>
                                    ) : null}
                                </div>

                                <MockUrl origin={origin} serverKey={server.key} />

                                {armed === server.id ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-destructive w-full text-xs leading-relaxed">
                                            {t("deleteConfirm", { name: server.name })}
                                        </p>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="destructive"
                                            disabled={pending}
                                            onClick={() => remove(server.id)}
                                        >
                                            {pending ? (
                                                <IconLoader2
                                                    className="size-4 animate-spin"
                                                    aria-hidden="true"
                                                />
                                            ) : null}
                                            {t("deleteAction")}
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            disabled={pending}
                                            onClick={() => setArmed(null)}
                                        >
                                            {t("cancel")}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Link
                                            href={`/mock/${workspaceId}/servers/${server.id}`}
                                            className={cn(
                                                buttonVariants({ size: "sm" }),
                                                "gap-1.5",
                                            )}
                                        >
                                            {t("open")}
                                            <IconArrowRight className="size-4" aria-hidden="true" />
                                        </Link>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="text-destructive hover:text-destructive ml-auto gap-1.5"
                                            disabled={pending}
                                            onClick={() => setArmed(server.id)}
                                        >
                                            <IconTrash className="size-3.5" aria-hidden="true" />
                                            {t("delete")}
                                        </Button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section
                aria-labelledby="create-server-heading"
                className="border-border/70 bg-card rounded-2xl border p-5 shadow-xs"
            >
                <h2
                    id="create-server-heading"
                    className="text-foreground text-sm leading-[1.3] font-semibold"
                >
                    {t("createTitle")}
                </h2>
                <p className="text-muted-foreground mt-1 max-w-[60ch] text-xs leading-relaxed">
                    {t("createDescription")}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={nameId} className="text-xs">
                            {t("nameLabel")}
                        </Label>
                        <Input
                            id={nameId}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder={t("namePlaceholder")}
                            disabled={!hasRoom}
                            autoComplete="off"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={keyId} className="text-xs">
                            {t("keyLabel")}
                        </Label>
                        <Input
                            id={keyId}
                            value={key}
                            onChange={(event) => setKey(event.target.value)}
                            placeholder={t("keyPlaceholder")}
                            disabled={!hasRoom}
                            autoComplete="off"
                            spellCheck={false}
                            className="font-mono"
                        />
                    </div>
                </div>

                {previewKey !== "" ? (
                    <p className="text-muted-foreground mt-3 text-xs">
                        {t("addressPreview")}{" "}
                        <code className="text-foreground font-mono">
                            {origin}/m/{previewKey}/…
                        </code>
                    </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                        type="button"
                        disabled={!hasRoom || pending || name.trim() === ""}
                        onClick={submit}
                        className="gap-1.5"
                    >
                        {pending ? (
                            <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <IconPlus className="size-4" aria-hidden="true" />
                        )}
                        {t("createAction")}
                    </Button>

                    {status !== null ? (
                        <StatusStrip tone={status.tone} message={status.message} />
                    ) : null}
                </div>
            </section>
        </div>
    );
}
