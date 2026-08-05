"use client";

import { create } from "zustand";
import { temporal } from "zundo";

import {
    addNode,
    autoLayout,
    connect,
    copyFragment,
    disconnect,
    moveNode,
    pasteFragment,
    removeNodes,
    updateNodeData,
    type GraphFragment,
} from "../domain/graph-edit";
import type { GraphDocument, GraphNode, NodeKind } from "../types/graph";

/**
 * The canvas's state, and nothing else.
 *
 * Zustand with selector subscriptions rather than React Context: the graph
 * changes on every drag frame, and a context provider re-renders every consumer
 * on every change — which for a canvas of forty nodes is forty re-renders per
 * frame. The React Compiler helps with memoisation and does not fix context
 * fan-out.
 *
 * Every mutation delegates to a pure function in `domain/graph-edit.ts`. What
 * lives here is which nodes are selected, what is on the clipboard, and whether
 * there are unsaved changes.
 */

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict";

/** Order matters: React Flow reports selection in its own order, consistently. */
function sameIds(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, index) => id === b[index]);
}

export type StudioState = {
    graph: GraphDocument;
    /**
     * Which endpoint and version the store currently holds.
     *
     * Readiness is derived from this rather than from a `useState` set inside an
     * effect — which is both the repo's rule and the correct shape: the answer
     * to "is the store showing this endpoint" lives in the store, not in a
     * component that has to be told twice.
     */
    loadedKey: string | null;
    selection: readonly string[];
    clipboard: GraphFragment | null;
    saveState: SaveState;
    version: number;

    load: (graph: GraphDocument, version: number, key: string) => void;
    setSaveState: (state: SaveState) => void;
    markSaved: (version: number) => void;

    select: (ids: readonly string[]) => void;
    addNodeAt: (kind: NodeKind, position: { x: number; y: number }) => void;
    setNodeData: (nodeId: string, data: GraphNode["data"]) => void;
    dragNode: (nodeId: string, position: { x: number; y: number }) => void;
    connectNodes: (source: string, handle: string, target: string) => void;
    removeEdge: (edgeId: string) => void;
    deleteSelection: () => void;
    copySelection: () => void;
    paste: () => void;
    duplicateSelection: () => void;
    layout: () => void;
};

/**
 * `partialize` is the important line.
 *
 * Only the nodes and edges enter the undo stack. Without it, panning and
 * selecting would fill the history and Ctrl+Z would scroll the canvas instead
 * of undoing an edit — the single most common complaint about hand-rolled undo
 * on a graph editor.
 *
 * `equality` stops a drag from recording one history entry per frame: React
 * Flow fires a position change continuously, and a hundred entries for one
 * gesture makes undo useless.
 */
export const useStudioStore = create<StudioState>()(
    temporal(
        (set, get) => ({
            graph: { schemaVersion: 1, nodes: [], edges: [] },
            loadedKey: null,
            selection: [],
            clipboard: null,
            saveState: "idle",
            version: 1,

            load: (graph, version, key) =>
                set({ graph, version, loadedKey: key, saveState: "idle", selection: [] }),
            setSaveState: (saveState) => set({ saveState }),
            markSaved: (version) => set({ version, saveState: "saved" }),

            /**
             * Ignores a selection that has not actually changed.
             *
             * This guard is load-bearing, not an optimisation. React Flow is
             * driven by controlled `nodes`, and its `StoreUpdater` re-syncs
             * whenever that array's *reference* changes. The canvas derives that
             * array from `selection`, and React Flow fires `onSelectionChange`
             * whenever it syncs — so storing a fresh array on every call closed
             * the loop: new array → new nodes → setNodes → onSelectionChange →
             * new array. Comparing contents breaks it, and there is no other
             * place it can be broken without giving up controlled nodes.
             */
            select: (selection) =>
                set((state) =>
                    sameIds(state.selection, selection) ? state : { ...state, selection },
                ),

            addNodeAt: (kind, position) =>
                set((state) => ({
                    graph: addNode(state.graph, kind, position),
                    saveState: "dirty",
                })),

            setNodeData: (nodeId, data) =>
                set((state) => ({
                    graph: updateNodeData(state.graph, nodeId, data),
                    saveState: "dirty",
                })),

            dragNode: (nodeId, position) =>
                set((state) => {
                    const graph = moveNode(state.graph, nodeId, position);

                    // `moveNode` returns the same reference when nothing moved.
                    // Passing that through unchanged keeps the canvas's
                    // controlled `nodes` array stable, which is what stops a
                    // measure-on-mount from becoming an update loop.
                    return graph === state.graph ? state : { ...state, graph, saveState: "dirty" };
                }),

            connectNodes: (source, handle, target) =>
                set((state) => ({
                    graph: connect(state.graph, source, handle, target),
                    saveState: "dirty",
                })),

            removeEdge: (edgeId) =>
                set((state) => ({
                    graph: disconnect(state.graph, edgeId),
                    saveState: "dirty",
                })),

            deleteSelection: () =>
                set((state) => ({
                    graph: removeNodes(state.graph, state.selection),
                    selection: [],
                    saveState: "dirty",
                })),

            copySelection: () =>
                set((state) => ({ clipboard: copyFragment(state.graph, state.selection) })),

            paste: () => {
                const { graph, clipboard } = get();

                if (clipboard === null) {
                    return;
                }

                const result = pasteFragment(graph, clipboard);

                // Selecting what was just pasted: a paste that leaves the reader
                // unsure what appeared is the small thing that makes a canvas
                // feel broken.
                set({ graph: result.graph, selection: result.ids, saveState: "dirty" });
            },

            duplicateSelection: () => {
                const { graph, selection } = get();
                const result = pasteFragment(graph, copyFragment(graph, selection));

                set({ graph: result.graph, selection: result.ids, saveState: "dirty" });
            },

            layout: () => set((state) => ({ graph: autoLayout(state.graph), saveState: "dirty" })),
        }),
        {
            limit: 100,
            partialize: (state) => ({ graph: state.graph }),
            equality: (a, b) => JSON.stringify(a.graph) === JSON.stringify(b.graph),
        },
    ),
);
