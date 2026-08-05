"use client";

import {
    IconArrowBackUp,
    IconArrowForwardUp,
    IconEraser,
    IconLayoutGrid,
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
    IconLayoutSidebarRightCollapse,
    IconLayoutSidebarRightExpand,
    IconLoader2,
    IconPlus,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";

import { INSPECTOR_SHORTCUT, isTypingTarget, PALETTE_SHORTCUT } from "../domain/keyboard";
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
    const paletteOpen = useStudioStore((state) => state.paletteOpen);
    const inspectorOpen = useStudioStore((state) => state.inspectorOpen);
    const togglePalette = useStudioStore((state) => state.togglePalette);
    const toggleInspector = useStudioStore((state) => state.toggleInspector);

    const [confirmingClear, setConfirmingClear] = useState(false);

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

    /**
     * `[` and `]` fold the two rails.
     *
     * Bound here rather than in `GraphCanvas` because the panels belong to this
     * component and the canvas is only mounted once the store is ready — a
     * shortcut that does not work for the first second is a shortcut people stop
     * reaching for. Two window listeners is the right cost for that.
     *
     * Guarded three ways: not while typing, not while a modifier is held (so
     * `⌘[` stays the browser's Back), and not while the clear dialog is up,
     * where a rail folding behind the confirmation would be noise.
     */
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const target = event.target as HTMLElement | null;

            if (
                confirmingClear ||
                event.metaKey ||
                event.ctrlKey ||
                event.altKey ||
                isTypingTarget(target?.tagName ?? null, target?.isContentEditable)
            ) {
                return;
            }

            if (event.key === PALETTE_SHORTCUT) {
                event.preventDefault();
                togglePalette();
            } else if (event.key === INSPECTOR_SHORTCUT) {
                event.preventDefault();
                toggleInspector();
            }
        }

        window.addEventListener("keydown", onKeyDown);

        return () => window.removeEventListener("keydown", onKeyDown);
    }, [confirmingClear, togglePalette, toggleInspector]);

    const selected = current.nodes.find((node) => node.id === selection[0]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-border/70 flex flex-wrap items-center gap-1 border-b px-3 py-2">
                <IconAction
                    label={t("undo")}
                    shortcut="⌘Z"
                    className="size-8"
                    onClick={() => useStudioStore.temporal.getState().undo()}
                >
                    <IconArrowBackUp className="size-4" aria-hidden="true" />
                </IconAction>
                <IconAction
                    label={t("redo")}
                    shortcut="⇧⌘Z"
                    className="size-8"
                    onClick={() => useStudioStore.temporal.getState().redo()}
                >
                    <IconArrowForwardUp className="size-4" aria-hidden="true" />
                </IconAction>
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
                    onClick={() => setConfirmingClear(true)}
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
                nothing.

                Four explicit column templates rather than one built from a
                variable: Tailwind generates from what it can *see* in the
                source, so an interpolated `lg:grid-cols-[${w}]` produces no CSS
                at all. */}
            <div
                className={cn(
                    "flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:overflow-hidden",
                    paletteOpen && inspectorOpen && "lg:grid-cols-[13rem_minmax(0,1fr)_22rem]",
                    paletteOpen && !inspectorOpen && "lg:grid-cols-[13rem_minmax(0,1fr)_2.75rem]",
                    !paletteOpen && inspectorOpen && "lg:grid-cols-[2.75rem_minmax(0,1fr)_22rem]",
                    !paletteOpen &&
                        !inspectorOpen &&
                        "lg:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]",
                )}
            >
                <aside
                    aria-label={t("palette")}
                    className={cn(
                        "border-border/70 flex shrink-0 flex-col border-b lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0",
                        paletteOpen ? "gap-2 p-3" : "gap-2 p-2",
                    )}
                >
                    <div className="flex items-center gap-1">
                        <span
                            className={cn(
                                "text-muted-foreground min-w-0 truncate text-[0.6875rem] font-semibold tracking-[0.09em] uppercase",
                                // Hidden only where the rail is actually narrow.
                                // Stacked on a phone it is a full-width bar and
                                // an unlabelled chevron there says nothing.
                                !paletteOpen && "lg:hidden",
                            )}
                        >
                            {t("palette")}
                        </span>
                        <IconAction
                            label={paletteOpen ? t("hidePalette") : t("showPalette")}
                            shortcut={PALETTE_SHORTCUT}
                            expanded={paletteOpen}
                            className="text-muted-foreground ml-auto size-7 shrink-0"
                            onClick={togglePalette}
                        >
                            {paletteOpen ? (
                                <IconLayoutSidebarLeftCollapse
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            ) : (
                                <IconLayoutSidebarLeftExpand
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            )}
                        </IconAction>
                    </div>

                    {paletteOpen ? (
                        <>
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
                                {t("canvasHint")} {t("panelShortcuts")}
                            </p>
                        </>
                    ) : null}
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
                    className={cn(
                        "border-border/70 min-w-0 border-t lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l",
                        inspectorOpen ? "p-3" : "p-2",
                    )}
                >
                    <div className="flex items-center gap-1">
                        <IconAction
                            label={inspectorOpen ? t("hideInspector") : t("showInspector")}
                            shortcut={INSPECTOR_SHORTCUT}
                            expanded={inspectorOpen}
                            className="text-muted-foreground relative order-2 ml-auto size-7 shrink-0 lg:order-none lg:ml-0"
                            onClick={toggleInspector}
                        >
                            {inspectorOpen ? (
                                <IconLayoutSidebarRightCollapse
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            ) : (
                                <IconLayoutSidebarRightExpand
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            )}
                            {/* Selecting a node opens this rail, so the only way
                                to be here is to have shut it by hand afterwards.
                                That choice stands — but a selection behind a
                                closed rail would otherwise be invisible. */}
                            {!inspectorOpen && selected !== undefined ? (
                                <span
                                    className="bg-brand-violet absolute top-1 right-1 size-1.5 rounded-full"
                                    aria-hidden="true"
                                />
                            ) : null}
                        </IconAction>

                        <h3
                            id="inspector-heading"
                            className={cn(
                                "text-muted-foreground order-1 min-w-0 flex-1 truncate text-[0.6875rem] font-semibold tracking-[0.09em] uppercase lg:order-none",
                                !inspectorOpen && "lg:hidden",
                            )}
                        >
                            {t("inspector")}
                        </h3>
                    </div>

                    {!inspectorOpen ? null : selected === undefined ? (
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

            {/*
             * A real dialog rather than a toast with an action in it.
             *
             * A toast is an announcement: it can be missed, it can be covered by
             * the next one, and it times out — none of which a destructive
             * confirmation may do. This one takes focus, says exactly what goes
             * and what survives, and cannot be dismissed by waiting.
             */}
            <Dialog open={confirmingClear} onOpenChange={setConfirmingClear}>
                <DialogContent showCloseButton={false} className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t("clearConfirm")}</DialogTitle>
                        <DialogDescription>{t("clearConfirmHint")}</DialogDescription>
                    </DialogHeader>

                    <DialogFooter>
                        <DialogClose render={<Button variant="outline" />}>
                            {t("clearCancel")}
                        </DialogClose>
                        <Button
                            type="button"
                            variant="destructive"
                            className="gap-1.5"
                            onClick={() => {
                                clear();
                                setConfirmingClear(false);
                                toast.success(t("cleared"), { description: t("clearedHint") });
                            }}
                        >
                            <IconEraser className="size-4" aria-hidden="true" />
                            {t("clear")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

type IconActionProps = {
    label: string;
    /** The key that does the same thing, shown as a chip beside the label. */
    shortcut?: string;
    className?: string;
    expanded?: boolean;
    onClick: () => void;
    children: ReactNode;
};

/**
 * An icon button whose name and shortcut are both discoverable on hover.
 *
 * `aria-label` alone is invisible to a pointer — it names the control for a
 * screen reader and produces no tooltip at all, which is how a rail of unlabelled
 * glyphs ends up being guessed at. The label goes in both places; the key goes
 * only in the tooltip, because "Hide the inspector (])" read aloud is noise.
 */
function IconAction({ label, shortcut, className, expanded, onClick, children }: IconActionProps) {
    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={className}
                        aria-label={label}
                        aria-expanded={expanded}
                        onClick={onClick}
                    />
                }
            >
                {children}
            </TooltipTrigger>
            <TooltipContent side="bottom">
                {label}
                {shortcut === undefined ? null : (
                    <kbd
                        data-slot="kbd"
                        className="bg-background/20 text-background px-1.5 py-0.5 font-mono text-[0.6875rem] leading-[1.3]"
                    >
                        {shortcut}
                    </kbd>
                )}
            </TooltipContent>
        </Tooltip>
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
