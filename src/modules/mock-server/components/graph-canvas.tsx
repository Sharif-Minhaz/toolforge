"use client";

import {
    Background,
    BackgroundVariant,
    Controls,
    Handle,
    MiniMap,
    Position,
    ReactFlow,
    type Edge,
    type Node,
    type NodeProps,
} from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo } from "react";

import { cn } from "@/lib/utils";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";

import { handlesFor, nodeDefinition } from "../domain/node-registry";
import type { GraphNode, NodeKind } from "../types/graph";
import { useStudioStore } from "./studio-store";

import "@xyflow/react/dist/style.css";

/**
 * The canvas.
 *
 * Imported dynamically by its parent with `ssr: false`, for two reasons: React
 * Flow touches `window` on evaluation, and it is ~150 KB that no reader of the
 * other twenty-eight tools should ever download. The same rule the Leaflet map
 * in the Domain Inspector follows.
 *
 * Everything it does delegates to the store, which delegates to pure functions.
 * There is no graph logic on this page — which is why undo, copy/paste,
 * connection rules and auto-layout are all unit-tested without mounting it.
 */

type StudioNodeData = {
    kind: NodeKind;
    node: GraphNode;
    [key: string]: unknown;
};

/**
 * One node. A single component for every kind rather than one per kind: the
 * chrome is identical and the body is two lines of summary, so eleven
 * near-identical components would be eleven places for the selection ring to
 * drift.
 */
function StudioNode({ data, selected }: NodeProps) {
    const t = useTranslations("mockServer.nodes");
    const tHandles = useTranslations("mockServer.handles");

    const { kind, node } = data as StudioNodeData;
    const definition = nodeDefinition(kind);
    const outputs = handlesFor(node);

    return (
        <div
            className={cn(
                "border-border/70 bg-card min-w-44 rounded-xl border px-3 py-2 shadow-xs transition-colors",
                TOOL_ACCENT_VARS[definition.accent],
                selected && "border-[var(--tool-accent)] ring-2 ring-[var(--tool-accent)]/30",
            )}
        >
            {definition.acceptsInput ? (
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!size-2 !border-0 !bg-[var(--tool-accent)]"
                />
            ) : null}

            <p className="text-foreground text-xs leading-[1.3] font-semibold">{t(kind)}</p>
            <p className="text-muted-foreground mt-0.5 text-[0.625rem] leading-[1.3]">
                {definition.implemented ? node.id : t("comingSoon")}
            </p>

            {outputs.map((handle, index) => (
                <Handle
                    key={handle.id}
                    id={handle.id}
                    type="source"
                    position={Position.Right}
                    // Stacked down the right edge so a branching node's outputs
                    // are individually reachable rather than overlapping.
                    style={{ top: `${((index + 1) / (outputs.length + 1)) * 100}%` }}
                    className="!size-2 !border-0 !bg-[var(--tool-accent)]"
                >
                    {outputs.length > 1 ? (
                        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[0.5625rem] whitespace-nowrap">
                            {tHandles(handle.labelKey)}
                        </span>
                    ) : null}
                </Handle>
            ))}
        </div>
    );
}

const NODE_TYPES = { studio: StudioNode };

export function GraphCanvas() {
    const graph = useStudioStore((state) => state.graph);
    const selection = useStudioStore((state) => state.selection);
    const select = useStudioStore((state) => state.select);
    const dragNode = useStudioStore((state) => state.dragNode);
    const connectNodes = useStudioStore((state) => state.connectNodes);
    const removeEdge = useStudioStore((state) => state.removeEdge);
    const deleteSelection = useStudioStore((state) => state.deleteSelection);
    const copySelection = useStudioStore((state) => state.copySelection);
    const paste = useStudioStore((state) => state.paste);
    const duplicateSelection = useStudioStore((state) => state.duplicateSelection);

    const nodes = useMemo<Node[]>(
        () =>
            graph.nodes.map((node) => ({
                id: node.id,
                type: "studio",
                position: node.position,
                selected: selection.includes(node.id),
                data: { kind: node.kind, node } satisfies StudioNodeData,
            })),
        [graph.nodes, selection],
    );

    const edges = useMemo<Edge[]>(
        () =>
            graph.edges.map((edge) => ({
                id: edge.id,
                source: edge.source,
                sourceHandle: edge.sourceHandle,
                target: edge.target,
                animated: true,
            })),
        [graph.edges],
    );

    /**
     * Keyboard shortcuts, bound at the window rather than on the canvas.
     *
     * Guarded on the event target: a Delete pressed while the cursor is in the
     * inspector's text field must delete a character, not the node being
     * edited. That is the bug every hand-rolled canvas shortcut ships with.
     */
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const target = event.target as HTMLElement | null;

            if (
                target !== null &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "SELECT" ||
                    target.isContentEditable)
            ) {
                return;
            }

            const meta = event.metaKey || event.ctrlKey;

            if (!meta && (event.key === "Delete" || event.key === "Backspace")) {
                event.preventDefault();
                deleteSelection();

                return;
            }

            if (!meta) {
                return;
            }

            if (event.key === "c") {
                copySelection();
            } else if (event.key === "v") {
                paste();
            } else if (event.key === "d") {
                event.preventDefault();
                duplicateSelection();
            } else if (event.key === "z" && !event.shiftKey) {
                event.preventDefault();
                useStudioStore.temporal.getState().undo();
            } else if ((event.key === "z" && event.shiftKey) || event.key === "y") {
                event.preventDefault();
                useStudioStore.temporal.getState().redo();
            }
        }

        window.addEventListener("keydown", onKeyDown);

        return () => window.removeEventListener("keydown", onKeyDown);
    }, [deleteSelection, copySelection, paste, duplicateSelection]);

    const onNodesChange = useCallback(
        (changes: { id?: string; type?: string; position?: { x: number; y: number } }[]) => {
            for (const change of changes) {
                if (change.type === "position" && change.id && change.position) {
                    dragNode(change.id, change.position);
                }
            }
        },
        [dragNode],
    );

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onSelectionChange={({ nodes: selected }) => select(selected.map((node) => node.id))}
            onConnect={(connection) => {
                if (connection.source && connection.target) {
                    connectNodes(
                        connection.source,
                        connection.sourceHandle ?? "next",
                        connection.target,
                    );
                }
            }}
            onEdgeDoubleClick={(_event, edge) => removeEdge(edge.id)}
            fitView
            // Above this many nodes the cost of rendering off-screen ones stops
            // being free; below it the extra bookkeeping is the larger cost.
            onlyRenderVisibleElements={graph.nodes.length > 150}
            proOptions={{ hideAttribution: false }}
            className="[&_.react-flow\_\_attribution]:!bg-transparent"
        >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <MiniMap pannable zoomable className="!bg-card !border-border/70 !border" />
            <Controls showInteractive={false} />
        </ReactFlow>
    );
}
