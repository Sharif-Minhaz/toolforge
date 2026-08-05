"use client";

import {
    IconArrowBackUp,
    IconArrowForwardUp,
    IconEraser,
    IconLayoutGrid,
    IconLoader2,
    IconPlus,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";

import { nodeDefinition, placeableNodeKinds } from "../domain/node-registry";
import type { GraphDocument, NodeKind } from "../types/graph";
import { NodeInspector } from "./node-inspector";
import { ResponseBuilder } from "./response-builder";
import { useStudioStore } from "./studio-store";

/**
 * React Flow is client-only and ~150 KB. Loading it here rather than importing
 * it keeps it out of the shared bundle every other tool on the site pays for,
 * and out of the server render, where it would touch `window` and throw.
 */
const GraphCanvas = dynamic(async () => (await import("./graph-canvas")).GraphCanvas, {
    ssr: false,
    loading: () => <Skeleton className="size-full rounded-none" />,
});

type GraphStudioProps = {
    endpointId: string;
    graph: GraphDocument;
    version: number;
    /** Called on every edit so the parent can mark the endpoint unsaved. */
    onDirty: (endpointId: string) => void;
};

/**
 * The canvas, its palette, and the inspector for whatever is selected.
 *
 * Three panes filling their container, because this is mounted inside a
 * full-screen dialog rather than in a slot on the route form. It began as a
 * 26rem-high box under the response editor and that was the wrong shape for
 * every part of it at once: the canvas had no room to lay a graph out, the
 * palette wrapped into three rows of chips, and the inspector — which for a
 * response node is the whole tree editor — was pushed below the fold of a panel
 * that was itself below the fold of the page. A graph editor needs the viewport;
 * the compact form was giving it a letterbox.
 *
 * The response node's inspector is still the M2 tree editor, unchanged — which
 * is the point of having built it against `ValueExpr` rather than against a
 * form. The canvas gained a way to *reach* it; it did not replace it.
 */
export function GraphStudio({ endpointId, graph, version, onDirty }: GraphStudioProps) {
    const t = useTranslations("mockServer.studio");
    const tNodes = useTranslations("mockServer.nodes");

    const load = useStudioStore((state) => state.load);
    const current = useStudioStore((state) => state.graph);
    const selection = useStudioStore((state) => state.selection);
    const addNode = useStudioStore((state) => state.addNode);
    const setNodeData = useStudioStore((state) => state.setNodeData);
    const layout = useStudioStore((state) => state.layout);
    const clear = useStudioStore((state) => state.clear);
    const saveState = useStudioStore((state) => state.saveState);
    const loadedKey = useStudioStore((state) => state.loadedKey);

    const key = `${endpointId}:${version}`;
    const ready = loadedKey === key;

    // Seeded in an effect rather than during render: the store is module-level,
    // so writing to it while rendering would be a write to shared state during
    // React's render phase. Readiness is read back off the store, so nothing
    // here sets local state from an effect.
    useEffect(() => {
        if (loadedKey !== key) {
            load(graph, version, key);
            useStudioStore.temporal.getState().clear();
        }
    }, [graph, version, key, loadedKey, load]);

    // The parent owns persistence and reads the graph off the store when it
    // saves, so this only has to say *that* something changed — no second copy
    // of the document is pushed upward on every keystroke. The endpoint id
    // travels with it because the store outlives this component: without it, a
    // flow dirtied on one route would be saved onto the next one opened.
    useEffect(() => {
        if (ready && saveState === "dirty") {
            onDirty(endpointId);
        }
    }, [ready, saveState, onDirty, endpointId]);

    const selected = current.nodes.find((node) => node.id === selection[0]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-border/70 flex flex-wrap items-center gap-1 border-b px-3 py-2">
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={t("undo")}
                    onClick={() => useStudioStore.temporal.getState().undo()}
                >
                    <IconArrowBackUp className="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={t("redo")}
                    onClick={() => useStudioStore.temporal.getState().redo()}
                >
                    <IconArrowForwardUp className="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                    onClick={layout}
                >
                    <IconLayoutGrid className="size-4" aria-hidden="true" />
                    {t("autoLayout")}
                </Button>

                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive gap-1.5"
                    onClick={() =>
                        // Confirmed in the toast rather than by arming the
                        // button, so the destructive press is never the one
                        // already under the pointer. Ten seconds, because a
                        // confirmation that vanishes while it is being read is
                        // worse than no confirmation at all.
                        toast(t("clearConfirm"), {
                            description: t("clearConfirmHint"),
                            duration: 10_000,
                            action: {
                                label: t("clear"),
                                onClick: () => {
                                    clear();
                                    toast.success(t("cleared"), {
                                        description: t("clearedHint"),
                                    });
                                },
                            },
                        })
                    }
                >
                    <IconEraser className="size-4" aria-hidden="true" />
                    {t("clear")}
                </Button>

                <p className="text-muted-foreground ml-auto text-[0.6875rem] leading-[1.3]">
                    {t("flowSummary", { count: current.nodes.length })}
                </p>
            </div>

            {/* One scrolling column on a phone, three panes on a laptop. The
                canvas keeps a fixed height in the stacked form, because a flex
                child with no height inside a scroll container collapses to
                nothing. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[13rem_minmax(0,1fr)_22rem] lg:overflow-hidden">
                <aside
                    aria-label={t("palette")}
                    className="border-border/70 flex shrink-0 flex-col gap-2 border-b p-3 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
                >
                    <span className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase">
                        {t("palette")}
                    </span>

                    <div className="flex flex-wrap gap-1.5 lg:flex-col lg:flex-nowrap">
                        {placeableNodeKinds().map((kind) => (
                            <PaletteButton
                                key={kind}
                                kind={kind}
                                label={tNodes(kind)}
                                onAdd={addNode}
                            />
                        ))}
                    </div>

                    <p className="text-muted-foreground mt-auto hidden pt-3 text-[0.625rem] leading-normal lg:block">
                        {t("canvasHint")}
                    </p>
                </aside>

                <div className="h-[22rem] min-w-0 shrink-0 lg:h-auto lg:min-h-0">
                    {ready ? (
                        <GraphCanvas />
                    ) : (
                        <div className="grid size-full place-items-center">
                            <IconLoader2
                                className="text-muted-foreground size-5 animate-spin"
                                aria-hidden="true"
                            />
                        </div>
                    )}
                </div>

                <aside
                    aria-labelledby="inspector-heading"
                    className="border-border/70 min-w-0 border-t p-3 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l"
                >
                    <h3
                        id="inspector-heading"
                        className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase"
                    >
                        {t("inspector")}
                    </h3>

                    {selected === undefined ? (
                        <p className="border-border/70 text-muted-foreground mt-2 rounded-xl border border-dashed p-5 text-center text-xs">
                            {t("nothingSelected")}
                        </p>
                    ) : selected.kind === "response" ? (
                        <div className="mt-2 min-w-0">
                            <ResponseBuilder
                                value={selected.data.body}
                                onChange={(body) =>
                                    setNodeData(selected.id, { ...selected.data, body })
                                }
                            />
                        </div>
                    ) : (
                        <div className="mt-2 min-w-0">
                            <NodeInspector
                                node={selected}
                                onChange={(data) => setNodeData(selected.id, data)}
                            />
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}

type PaletteButtonProps = {
    kind: NodeKind;
    label: string;
    onAdd: (kind: NodeKind) => void;
};

function PaletteButton({ kind, label, onAdd }: PaletteButtonProps) {
    const definition = nodeDefinition(kind);

    return (
        <button
            type="button"
            // A click rather than a drag. Dragging is the expected gesture and
            // will be added, but click-to-add is the one a keyboard reaches, so
            // it is the one that ships first — no affordance here is
            // pointer-only.
            //
            // Where it lands is the store's business, not the palette's: it goes
            // to the middle of the current viewport, which is the only answer
            // that keeps a new node in front of the reader after a pan.
            onClick={() => onAdd(kind)}
            className={cn(
                "border-border/70 bg-card focus-visible:ring-ring flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[0.6875rem] transition-colors hover:border-[var(--tool-accent)]/50 hover:bg-[var(--tool-accent)]/8 focus-visible:ring-2 focus-visible:outline-none lg:w-full",
                TOOL_ACCENT_VARS[definition.accent],
                !definition.implemented && "opacity-60",
            )}
        >
            <IconPlus
                className="size-3 shrink-0 text-[var(--tool-accent)]"
                stroke={2.2}
                aria-hidden="true"
            />
            <span className="min-w-0 truncate">{label}</span>
        </button>
    );
}
