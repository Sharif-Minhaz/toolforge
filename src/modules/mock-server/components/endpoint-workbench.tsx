"use client";

import { IconLoader2, IconPlus, IconSitemap, IconTrash, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";

import { getRequestShape, type RequestShapeResult } from "../actions/request-shape";
import { createEndpoint, deleteEndpoint, getEndpoint, updateEndpoint } from "../actions/servers";
import { ALLOWED_CONTENT_TYPES, type AllowedContentType } from "../domain/content-type";
import {
    declaredRequestShape,
    declaredVariables,
    hasSingleResponse,
    readResponseBody,
} from "../domain/graph-edit";
import { ENDPOINT_NAME_LENGTH, MAX_PATH_LENGTH } from "../domain/constants";
import { parsePathPattern } from "../domain/path-pattern";
import { EMPTY_OBSERVED_SHAPE } from "../domain/suggest-path";
import { HTTP_METHODS, type HttpMethod } from "../types/graph";
import type { EndpointDetail, EndpointSummary, ServerFailureReason } from "../types";
import { EndpointSkeleton } from "./endpoint-skeleton";
import { GraphStudio } from "./graph-studio";
import { useStudioStore } from "./studio-store";
import { MockUrl } from "./mock-url";
import { ResponseBuilder } from "./response-builder";
import { SuggestionProvider, type EditorSuggestions } from "./suggestion-context";

type EndpointWorkbenchProps = {
    serverId: string;
    serverKey: string;
    /** Needed for the request-shape lookup, which is workspace-scoped. */
    workspaceId: string;
    origin: string;
    endpoints: readonly EndpointSummary[];
};

/**
 * The parameters a route pattern names.
 *
 * Read from the pattern rather than from traffic, so they are complete the
 * instant the route exists. A wildcard is offered under the key `extractParams`
 * files it as, which is the literal `*`.
 */
function routeParams(pattern: string): readonly string[] {
    const parsed = parsePathPattern(pattern);

    if (!parsed.ok) {
        return [];
    }

    return parsed.parsed.hasWildcard
        ? [...parsed.parsed.paramNames, "*"]
        : parsed.parsed.paramNames;
}

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
    // Violet rather than a second green: QUERY is safe and idempotent like GET,
    // but it is not GET, and a reader scanning a route list needs to see which
    // of the two a client will actually send.
    QUERY: "text-brand-violet",
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
    workspaceId,
    origin,
    endpoints,
}: EndpointWorkbenchProps) {
    const t = useTranslations("mockServer.endpoints");
    const tErrors = useTranslations("mockServer.serverErrors");
    const tToast = useTranslations("mockServer.toast");
    const tStudio = useTranslations("mockServer.studio");
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

    /**
     * The route whose fetch the editor column is waiting on.
     *
     * Its own flag rather than a read of `pending`, because `pending` is also
     * true while saving and deleting — and swapping the form somebody is
     * mid-edit in for a skeleton is a worse answer than showing nothing. The
     * `useRef` beside it is what decides whether a reply still matters: two
     * clicks in quick succession give two requests that can land in either
     * order, and the older one arriving last would put the wrong route in the
     * editor while the list highlights the right one.
     */
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const loadRequest = useRef<string | null>(null);

    /**
     * What recent requests to the open route were shaped like.
     *
     * Fetched when a route opens rather than when a picker is first used: the
     * pickers are inside a dialog and inside a recursive tree, and a lookup
     * started from there would either fire once per row or need a second piece
     * of coordination to stop it. One call per route, in the same handler that
     * loaded the route, is both simpler and warm by the time anybody types.
     *
     * `null` means "not asked yet", which is what the spinner in the picker's
     * trigger reads — distinct from an answer of no traffic, which is a
     * sentence the picker prints.
     *
     * The route it was fetched for is stored alongside it, and checked before
     * it is used. Two clicks in quick succession give two requests that can
     * land in either order, and a list of one route's fields offered while a
     * different route is open is exactly the wrong answer for a feature whose
     * whole claim is that these paths are real.
     */
    const [shape, setShape] = useState<{
        endpointId: string;
        result: RequestShapeResult;
    } | null>(null);

    const [draftMethod, setDraftMethod] = useState<HttpMethod>("GET");
    const [draftPath, setDraftPath] = useState("/");

    // Both cap at `maxLength`, so neither can read "over". `open` is null
    // whenever no route is showing, and a hook cannot be conditional — the
    // meter it feeds is inside the dialog and unmounted along with it.
    const draftPathLimit = useInputLimit(draftPath.length, MAX_PATH_LENGTH);
    const openNameLimit = useInputLimit(open?.name.length ?? 0, ENDPOINT_NAME_LENGTH.max);
    const [flowOpen, setFlowOpen] = useState(false);

    /**
     * The graph lives in the studio store, and nowhere else, for as long as a
     * route is open.
     *
     * It used to live in two places — `open.graph` plus whatever the canvas had
     * — with a flag deciding which one a save should believe, and a *third*
     * copy of the body in `open.body` on top of that. Every save sent the graph
     * and the body separately and the body won, so anything built in the flow
     * editor was overwritten by whatever the form was holding.
     *
     * Loading here rather than inside `GraphStudio` is what makes one document
     * possible: the store is filled the instant a route opens, not the first
     * time somebody opens the canvas, so the body editor below can write
     * through it too. `saveState` then answers "are there unsaved changes" for
     * both editors at once, and there is no flag to keep in step.
     */
    const graph = useStudioStore((state) => state.graph);
    const graphReady = useStudioStore((state) => state.loadedKey) === (open && studioKey(open));
    const setResponseBody = useStudioStore((state) => state.setResponseBody);
    const dirty = useStudioStore((state) => state.saveState) === "dirty";

    /** Fills the store from a freshly loaded route and resets its history. */
    const adopt = useCallback((endpoint: EndpointDetail) => {
        useStudioStore.getState().load(endpoint.graph, endpoint.version, studioKey(endpoint));
        useStudioStore.temporal.getState().clear();
    }, []);

    /**
     * Loads the path-picker facts for one route.
     *
     * Deliberately outside the transition that loads the route: this only fills
     * a suggestion list, and making the editor wait on it would trade an
     * instant open for a slower one to no purpose. A failure is already
     * swallowed by the action, which answers with an empty shape.
     */
    const loadShape = useCallback(
        (endpointId: string) => {
            setShape(null);

            void getRequestShape({ workspaceId, serverId, endpointId }).then((result) =>
                setShape({ endpointId, result }),
            );
        },
        [workspaceId, serverId],
    );

    // Derived, never stored. The body the form shows is the one on the graph's
    // response node — the same node the canvas inspector edits.
    const body = (graphReady ? readResponseBody(graph) : null) ?? open?.body ?? null;

    // A branching flow has more than one response and the form can only reach
    // the first, so it stops pretending to be the editor for them. See
    // `hasSingleResponse`.
    const bodyEditable = !graphReady || hasSingleResponse(graph);

    function patch(next: Partial<EndpointDetail>) {
        setOpen((held) => (held === null ? held : { ...held, ...next }));
    }

    /**
     * Reports a failure that has nowhere on the page to appear.
     *
     * The status strip lives beside the Save button, in the *editor* column —
     * which is the right home for a save that was refused and the wrong one for
     * everything else here. Adding a route is a press in the left column, and
     * when no route is open that column is the only thing rendered, so a refused
     * creation had no way to say so at all: the button simply did nothing.
     *
     * Title plus description rather than one line, because the reasons are
     * sentences. `path_has_query` is two of them, and a toast whose title is a
     * paragraph reads as a wall.
     */
    function reportFailure(kind: "create" | "load" | "delete", reason: ServerFailureReason) {
        toast.error(tToast(`${kind}Failed`), { description: tErrors(reason) });
    }

    /**
     * Disowns a load still in flight.
     *
     * Creating a route and deleting one both decide what the editor shows, so a
     * reply arriving afterwards must not get to decide it again. Clearing the
     * ref is what makes `load` drop that reply on the floor.
     */
    function cancelLoad() {
        loadRequest.current = null;
        setLoadingId(null);
    }

    function load(endpointId: string) {
        setFailure(null);
        // The dialog is bound to whichever route is open, so switching route
        // with it up would swap the graph under the reader's cursor.
        setFlowOpen(false);
        loadRequest.current = endpointId;
        setLoadingId(endpointId);

        startTransition(async () => {
            const result = await getEndpoint(endpointId);

            // A later click owns the editor now, so this reply is stale — and
            // clearing the skeleton on it would uncover the previous route
            // while the one actually being fetched is still in flight.
            if (loadRequest.current !== endpointId) {
                return;
            }

            setLoadingId(null);

            if (!result.ok) {
                reportFailure("load", result.reason);

                return;
            }

            setOpen(result.endpoint);
            adopt(result.endpoint);
            loadShape(result.endpoint.id);
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
                reportFailure("create", result.reason);

                return;
            }

            // Prepended, matching the newest-first order the server sends back
            // — so the row is where `router.refresh()` will put it anyway, and
            // the list does not reshuffle a moment after the click.
            setRows((held) => [toSummary(result.endpoint), ...held]);
            cancelLoad();
            setOpen(result.endpoint);
            adopt(result.endpoint);
            // A route created a second ago has no traffic, but the workspace's
            // environment keys are worth having and come back in the same call.
            loadShape(result.endpoint.id);
            setDraftPath("/");
            toast.success(tToast("endpointCreated"));
            router.refresh();
        });
    }

    /** `onDone` is what lets the flow dialog close itself only on a real save. */
    function save(onDone?: () => void) {
        if (open === null || pending) {
            return;
        }

        setFailure(null);

        // One document. The body sent is read back off the very graph being
        // sent, so the two cannot disagree — which is the whole bug this
        // replaced: they were separate, and the body silently won.
        const current = graphReady ? useStudioStore.getState().graph : open.graph;
        const currentBody = readResponseBody(current) ?? open.body;

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
                body: currentBody,
                graph: current,
                version: open.version,
            });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setOpen(result.endpoint);
            adopt(result.endpoint);
            setRows((held) =>
                held.map((row) =>
                    row.id === result.endpoint.id ? toSummary(result.endpoint) : row,
                ),
            );
            toast.success(tToast("endpointSaved"));
            router.refresh();
            onDone?.();
        });
    }

    function remove(endpointId: string) {
        startTransition(async () => {
            const result = await deleteEndpoint({ endpointId });

            if (!result.ok) {
                reportFailure("delete", result.reason);
                setArmed(null);

                return;
            }

            setRows((held) => held.filter((row) => row.id !== endpointId));
            setOpen((held) => (held?.id === endpointId ? null : held));

            if (loadRequest.current === endpointId) {
                cancelLoad();
            }

            setFlowOpen(false);
            setArmed(null);
            toast.success(tToast("endpointDeleted"));
            router.refresh();
        });
    }

    // Only ever a refused save. Everything else on this page reports through a
    // toast, because everything else is pressed somewhere this strip is not.
    const status: { tone: StatusTone; message: string } | null =
        failure !== null ? { tone: "error", message: tErrors(failure) } : null;

    // Only the answer fetched for the route currently open counts. See the note
    // on `shape` for why an out-of-order reply is a real possibility here.
    const forOpenRoute = shape !== null && shape.endpointId === open?.id ? shape.result : null;

    // Rebuilt each render rather than memoised: `vars` is read off a graph that
    // changes as the reader edits it, so a cached value would offer a variable
    // name a moment after the node writing it had been renamed.
    const suggestions: EditorSuggestions = {
        request: {
            params: open === null ? [] : routeParams(open.path),
            observed: forOpenRoute?.observed ?? EMPTY_OBSERVED_SHAPE,
            // Off the graph rather than off the server: what a document said
            // this route carries was written onto its entry node at import, so
            // it is here the moment the route opens and needs no round trip.
            declared: graphReady ? declaredRequestShape(graph) : null,
        },
        vars: graphReady ? declaredVariables(graph) : [],
        envKeys: forOpenRoute?.envKeys ?? [],
        loading: open !== null && forOpenRoute === null,
    };

    return (
        <SuggestionProvider value={suggestions}>
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
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Label htmlFor={pathId} className="text-xs">
                                        {t("pathLabel")}
                                    </Label>
                                    <InputLimitMeter reading={draftPathLimit} />
                                </div>
                                <Input
                                    id={pathId}
                                    maxLength={MAX_PATH_LENGTH}
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
                                            "border-border/70 bg-card hover:border-border hover:bg-muted/40 relative flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors",
                                            (open?.id === row.id || loadingId === row.id) &&
                                                "border-(--tool-accent)/50",
                                        )}
                                    >
                                        {/*
                                         * The whole card opens the route, not just
                                         * the text in it: `after:inset-0` stretches
                                         * this button's hit area over the card's own
                                         * padding, which is the strip a pointer lands
                                         * on most often. The delete button then needs
                                         * `relative z-10` to stay above the overlay —
                                         * without it the row would swallow its press.
                                         *
                                         * A real `<button>` with a pseudo-element
                                         * rather than a click handler on the card,
                                         * because the card also contains a button and
                                         * nesting one inside another is invalid.
                                         */}
                                        <button
                                            type="button"
                                            onClick={() => load(row.id)}
                                            className="focus-visible:ring-ring flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg text-left after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:outline-none"
                                        >
                                            <span
                                                className={cn(
                                                    "shrink-0 font-mono text-[0.625rem] leading-[1.3] font-semibold",
                                                    METHOD_TONE[row.method] ??
                                                        "text-muted-foreground",
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
                                                    className="relative z-10 h-7 shrink-0 cursor-pointer px-2 text-[0.6875rem]"
                                                    disabled={pending}
                                                    onClick={() => remove(row.id)}
                                                >
                                                    {t("deleteAction")}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="relative z-10 h-7 shrink-0 cursor-pointer px-2 text-[0.6875rem]"
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
                                                className="text-muted-foreground hover:text-destructive relative z-10 size-7 shrink-0 cursor-pointer"
                                                aria-label={t("delete")}
                                                disabled={pending}
                                                onClick={() => setArmed(row.id)}
                                            >
                                                <IconTrash
                                                    className="size-3.5"
                                                    aria-hidden="true"
                                                />
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

                    {/* The skeleton wins over both, and only a *load* raises it —
                        `pending` is also true while saving and deleting, and
                        replacing the form a reader is mid-edit in with grey
                        boxes would be worse than showing nothing at all. */}
                    {loadingId !== null ? (
                        <div className="mt-3">
                            <EndpointSkeleton />
                        </div>
                    ) : open === null ? (
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
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Label htmlFor={nameId} className="text-xs">
                                            {t("nameLabel")}
                                        </Label>
                                        <InputLimitMeter reading={openNameLimit} />
                                    </div>
                                    <Input
                                        id={nameId}
                                        maxLength={ENDPOINT_NAME_LENGTH.max}
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
                                <Label className="text-xs" id={bodyId}>
                                    {t("bodyLabel")}
                                </Label>
                                <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                                    {bodyEditable ? t("bodyHint") : t("bodyBranchedHint")}
                                </p>
                                {/* Nothing else says an upload is readable, and a
                                capability nobody can find is one that is not
                                there. Plain text rather than rich formatting:
                                the field names have to sit in the sentence, and
                                a Bangla sentence puts them somewhere else — so
                                markup around them would pin an English word
                                order onto both. */}
                                <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                                    {t("uploadsHint")}
                                </p>
                                {!bodyEditable ? (
                                    <div className="border-border/70 bg-muted/30 flex items-start gap-2 rounded-xl border p-3">
                                        <IconSitemap
                                            className="text-muted-foreground mt-0.5 size-4 shrink-0"
                                            aria-hidden="true"
                                        />
                                        <p className="text-muted-foreground max-w-[60ch] text-xs leading-relaxed">
                                            {t("bodyBranched", {
                                                count: graph.nodes.filter(
                                                    (node) => node.kind === "response",
                                                ).length,
                                            })}
                                        </p>
                                    </div>
                                ) : body === null ? null : (
                                    <ResponseBuilder value={body} onChange={setResponseBody} />
                                )}
                            </div>

                            {/* The graph is not a second tab beside the body — it is
                            the layer around it, and it needs the viewport rather
                            than a slot in a form. So it gets a door instead of a
                            panel. */}
                            <div className="border-border/70 bg-muted/30 flex flex-wrap items-center gap-3 rounded-xl border p-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-foreground text-xs leading-[1.3] font-medium">
                                        {t("flowLabel")}
                                    </p>
                                    <p className="text-muted-foreground mt-0.5 max-w-[60ch] text-[0.6875rem] leading-normal">
                                        {t("flowHint")}
                                    </p>
                                </div>

                                {dirty ? (
                                    <span className="text-brand-amber bg-brand-amber/12 rounded-lg px-2 py-1 text-[0.625rem] leading-[1.3] font-medium">
                                        {tStudio("unsaved")}
                                    </span>
                                ) : null}

                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5"
                                    onClick={() => setFlowOpen(true)}
                                >
                                    <IconSitemap className="size-4" aria-hidden="true" />
                                    {tStudio("openFlow")}
                                </Button>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => save()}
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

                {open === null ? null : (
                    <Dialog open={flowOpen} onOpenChange={setFlowOpen}>
                        <DialogContent
                            // Full-bleed rather than the default centred card: the
                            // canvas is the content, and `grid`/`p-4`/`max-w-sm`
                            // would letterbox it exactly the way the inline version
                            // did. `100dvh` rather than `100vh` so a phone's
                            // collapsing address bar does not push the footer off,
                            // and the width stays a percentage of the containing
                            // block rather than `100vw`, which counts the scrollbar
                            // and would overflow by its width on a desktop.
                            className="flex h-[calc(100dvh-1.5rem)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100%-1.5rem)]"
                            showCloseButton={false}
                        >
                            <div className="border-border/70 flex flex-wrap items-center gap-3 border-b px-4 py-3">
                                <div className="min-w-0 flex-1">
                                    <DialogTitle className="text-foreground truncate text-sm leading-[1.3] font-semibold">
                                        {tStudio("flowTitle")}
                                        <span className="text-muted-foreground ml-2 font-mono text-xs font-normal">
                                            {open.method} {open.path}
                                        </span>
                                    </DialogTitle>
                                    <DialogDescription className="text-muted-foreground mt-0.5 max-w-[70ch] text-[0.6875rem] leading-normal">
                                        {tStudio("flowDescription")}
                                    </DialogDescription>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={pending}
                                        onClick={() => save(() => setFlowOpen(false))}
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
                                    <DialogClose
                                        render={<Button variant="ghost" size="icon" />}
                                        aria-label={tStudio("close")}
                                    >
                                        <IconX className="size-4" aria-hidden="true" />
                                    </DialogClose>
                                </div>
                            </div>

                            {status !== null ? (
                                <div className="border-border/70 border-b px-4 py-2">
                                    <StatusStrip tone={status.tone} message={status.message} />
                                </div>
                            ) : null}

                            <GraphStudio ready={graphReady} />
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        </SuggestionProvider>
    );
}

/**
 * What the studio store calls this route.
 *
 * The version is in the key so a save — which bumps it — reloads the store from
 * what the server returned, rather than leaving the canvas showing a document
 * the database no longer agrees with.
 */
function studioKey(endpoint: Pick<EndpointDetail, "id" | "version">): string {
    return `${endpoint.id}:${endpoint.version}`;
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
