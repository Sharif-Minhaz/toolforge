"use client";

import { IconLoader2, IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CodeEditor } from "@/modules/tools/components/code-editor";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";

import { createEndpoint, deleteEndpoint, getEndpoint, updateEndpoint } from "../actions/servers";
import { ALLOWED_CONTENT_TYPES, type AllowedContentType } from "../domain/content-type";
import { HTTP_METHODS, type HttpMethod } from "../types/graph";
import type { EndpointDetail, EndpointSummary, ServerFailureReason } from "../types";
import { MockUrl } from "./mock-url";

type EndpointWorkbenchProps = {
    serverId: string;
    serverKey: string;
    origin: string;
    endpoints: readonly EndpointSummary[];
};

/** Base UI needs the whole value-to-label map on the root, or the trigger
 *  renders the raw value instead of the label. */
const METHOD_ITEMS: Record<string, string> = Object.fromEntries(
    HTTP_METHODS.map((method) => [method, method]),
);

const CONTENT_TYPE_ITEMS: Record<string, string> = Object.fromEntries(
    ALLOWED_CONTENT_TYPES.map((type) => [type, type]),
);

const METHOD_TONE: Record<string, string> = {
    GET: "text-brand-emerald",
    POST: "text-brand-cyan",
    PUT: "text-brand-amber",
    PATCH: "text-brand-amber",
    DELETE: "text-brand-rose",
    HEAD: "text-muted-foreground",
    OPTIONS: "text-muted-foreground",
};

/**
 * The endpoint list and the one endpoint being edited.
 *
 * M1's editor is a form over the response: status, content type, headers, body.
 * The body is typed as JSON because the tree editor that replaces it is M2 —
 * and the seam is deliberate, since what this writes is already a real
 * `GraphDocument` with a `static` value in it. M2 adds a second way to build
 * that value; it does not migrate anything.
 *
 * `version` is carried on the row and sent back on save. A save that comes back
 * `version_conflict` means another tab got there first, which is the ordinary
 * case with two studio windows open — so it is a message and a reload, never a
 * silent overwrite.
 */
export function EndpointWorkbench({
    serverId,
    serverKey,
    origin,
    endpoints,
}: EndpointWorkbenchProps) {
    const t = useTranslations("mockServer.endpoints");
    const tErrors = useTranslations("mockServer.serverErrors");
    const tToast = useTranslations("mockServer.toast");
    const router = useRouter();

    const nameId = useId();
    const pathId = useId();
    const statusId = useId();
    const bodyId = useId();

    const [rows, setRows] = useState<readonly EndpointSummary[]>(endpoints);
    const [open, setOpen] = useState<EndpointDetail | null>(null);
    const [failure, setFailure] = useState<ServerFailureReason | null>(null);
    const [armed, setArmed] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const [draftMethod, setDraftMethod] = useState<HttpMethod>("GET");
    const [draftPath, setDraftPath] = useState("/");

    function patch(next: Partial<EndpointDetail>) {
        setOpen((held) => (held === null ? held : { ...held, ...next }));
    }

    function load(endpointId: string) {
        setFailure(null);

        startTransition(async () => {
            const result = await getEndpoint(endpointId);

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setOpen(result.endpoint);
        });
    }

    function addEndpoint() {
        if (pending || draftPath.trim() === "") {
            return;
        }

        setFailure(null);

        startTransition(async () => {
            const result = await createEndpoint({
                serverId,
                collectionId: null,
                name: `${draftMethod} ${draftPath}`,
                method: draftMethod,
                path: draftPath,
            });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setRows((held) => [...held, toSummary(result.endpoint)]);
            setOpen(result.endpoint);
            setDraftPath("/");
            toast.success(tToast("endpointCreated"));
            router.refresh();
        });
    }

    function save() {
        if (open === null || pending) {
            return;
        }

        setFailure(null);

        startTransition(async () => {
            const result = await updateEndpoint({
                endpointId: open.id,
                name: open.name,
                method: open.method,
                path: open.path,
                isEnabled: open.isEnabled,
                status: open.status,
                contentType: open.contentType,
                headers: open.headers,
                bodyText: open.bodyText,
                version: open.version,
            });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setOpen(result.endpoint);
            setRows((held) =>
                held.map((row) =>
                    row.id === result.endpoint.id ? toSummary(result.endpoint) : row,
                ),
            );
            toast.success(tToast("endpointSaved"));
            router.refresh();
        });
    }

    function remove(endpointId: string) {
        startTransition(async () => {
            const result = await deleteEndpoint({ endpointId });

            if (!result.ok) {
                setFailure(result.reason);
                setArmed(null);

                return;
            }

            setRows((held) => held.filter((row) => row.id !== endpointId));
            setOpen((held) => (held?.id === endpointId ? null : held));
            setArmed(null);
            toast.success(tToast("endpointDeleted"));
            router.refresh();
        });
    }

    const status: { tone: StatusTone; message: string } | null =
        failure !== null ? { tone: "error", message: tErrors(failure) } : null;

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <section aria-labelledby="routes-heading" className="min-w-0">
                <h2
                    id="routes-heading"
                    className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase"
                >
                    {t("heading")}
                </h2>

                <div className="border-border/70 bg-card mt-3 flex flex-col gap-2 rounded-2xl border p-3 shadow-xs">
                    <div className="flex gap-2">
                        <div className="w-32 shrink-0">
                            <OptionSelect
                                label={t("methodLabel")}
                                value={draftMethod}
                                values={HTTP_METHODS}
                                items={METHOD_ITEMS}
                                onChange={setDraftMethod}
                            />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <Label htmlFor={pathId} className="text-xs">
                                {t("pathLabel")}
                            </Label>
                            <Input
                                id={pathId}
                                value={draftPath}
                                onChange={(event) => setDraftPath(event.target.value)}
                                placeholder="/users/:id"
                                autoComplete="off"
                                spellCheck={false}
                                className="font-mono text-xs"
                            />
                        </div>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        disabled={pending || draftPath.trim() === ""}
                        onClick={addEndpoint}
                        className="gap-1.5 self-start"
                    >
                        <IconPlus className="size-4" aria-hidden="true" />
                        {t("addAction")}
                    </Button>
                </div>

                {rows.length === 0 ? (
                    <p className="border-border/70 text-muted-foreground mt-3 rounded-2xl border border-dashed p-5 text-center text-xs leading-relaxed">
                        {t("empty")}
                    </p>
                ) : (
                    <ul className="mt-3 flex flex-col gap-1.5">
                        {rows.map((row) => (
                            <li key={row.id}>
                                <div
                                    className={cn(
                                        "border-border/70 bg-card flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors",
                                        open?.id === row.id && "border-[var(--tool-accent)]/50",
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => load(row.id)}
                                        className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:ring-2 focus-visible:outline-none"
                                    >
                                        <span
                                            className={cn(
                                                "shrink-0 font-mono text-[0.625rem] leading-[1.3] font-semibold",
                                                METHOD_TONE[row.method] ?? "text-muted-foreground",
                                            )}
                                        >
                                            {row.method}
                                        </span>
                                        <span
                                            className={cn(
                                                "text-foreground min-w-0 flex-1 truncate font-mono text-xs",
                                                !row.isEnabled &&
                                                    "text-muted-foreground/60 line-through",
                                            )}
                                        >
                                            {row.path}
                                        </span>
                                    </button>
                                    {armed === row.id ? (
                                        <>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="destructive"
                                                className="h-7 shrink-0 px-2 text-[0.6875rem]"
                                                disabled={pending}
                                                onClick={() => remove(row.id)}
                                            >
                                                {t("deleteAction")}
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 shrink-0 px-2 text-[0.6875rem]"
                                                disabled={pending}
                                                onClick={() => setArmed(null)}
                                            >
                                                {t("cancel")}
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="text-muted-foreground hover:text-destructive size-7 shrink-0"
                                            aria-label={t("delete")}
                                            disabled={pending}
                                            onClick={() => setArmed(row.id)}
                                        >
                                            <IconTrash className="size-3.5" aria-hidden="true" />
                                        </Button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section aria-labelledby="editor-heading" className="min-w-0">
                <h2
                    id="editor-heading"
                    className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase"
                >
                    {t("editorHeading")}
                </h2>

                {open === null ? (
                    <p className="border-border/70 text-muted-foreground mt-3 rounded-2xl border border-dashed p-8 text-center text-xs leading-relaxed">
                        {t("noSelection")}
                    </p>
                ) : (
                    <div className="border-border/70 bg-card mt-3 flex flex-col gap-4 rounded-2xl border p-5 shadow-xs">
                        <MockUrl origin={origin} serverKey={serverKey} path={open.path} />

                        {open.graphProblem !== null ? (
                            <StatusStrip tone="warning" message={t("graphProblem")} />
                        ) : null}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={nameId} className="text-xs">
                                    {t("nameLabel")}
                                </Label>
                                <Input
                                    id={nameId}
                                    value={open.name}
                                    onChange={(event) => patch({ name: event.target.value })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={statusId} className="text-xs">
                                    {t("statusLabel")}
                                </Label>
                                <Input
                                    id={statusId}
                                    type="number"
                                    inputMode="numeric"
                                    min={100}
                                    max={599}
                                    value={open.status}
                                    onChange={(event) =>
                                        patch({ status: Number(event.target.value) })
                                    }
                                    className="font-mono"
                                />
                            </div>

                            <OptionSelect
                                label={t("methodLabel")}
                                value={open.method as HttpMethod}
                                values={HTTP_METHODS}
                                items={METHOD_ITEMS}
                                onChange={(method) => patch({ method })}
                            />

                            <OptionSelect
                                label={t("contentTypeLabel")}
                                value={open.contentType as AllowedContentType}
                                values={ALLOWED_CONTENT_TYPES}
                                items={CONTENT_TYPE_ITEMS}
                                onChange={(contentType) => patch({ contentType })}
                            />
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <Label htmlFor={`${nameId}-enabled`} className="text-xs">
                                    {t("enabledLabel")}
                                </Label>
                                <p className="text-muted-foreground mt-0.5 text-[0.6875rem] leading-normal">
                                    {t("enabledHint")}
                                </p>
                            </div>
                            <Switch
                                id={`${nameId}-enabled`}
                                checked={open.isEnabled}
                                onCheckedChange={(checked) => patch({ isEnabled: checked })}
                            />
                        </div>

                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label className="text-xs">{t("bodyLabel")}</Label>
                            <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                                {t("bodyHint")}
                            </p>
                            <CodeEditor
                                id={bodyId}
                                value={open.bodyText}
                                onChange={(bodyText) => patch({ bodyText })}
                                language="json"
                                className="min-h-56"
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                type="button"
                                disabled={pending}
                                onClick={save}
                                className="gap-1.5"
                            >
                                {pending ? (
                                    <IconLoader2
                                        className="size-4 animate-spin"
                                        aria-hidden="true"
                                    />
                                ) : null}
                                {t("saveAction")}
                            </Button>

                            {status !== null ? (
                                <StatusStrip tone={status.tone} message={status.message} />
                            ) : null}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

function toSummary(detail: EndpointDetail): EndpointSummary {
    return {
        id: detail.id,
        collectionId: detail.collectionId,
        name: detail.name,
        method: detail.method,
        path: detail.path,
        isEnabled: detail.isEnabled,
        version: detail.version,
        updatedAt: detail.updatedAt,
    };
}
