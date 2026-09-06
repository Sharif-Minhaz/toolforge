"use client";

import { IconArrowsMinimize, IconFolderOpen, IconUpload } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { copyText } from "@/modules/tools/domain/clipboard";
import { MAX_COPY_BYTES, MAX_FILE_BYTES } from "../domain/constants";
import { byteToAscii, byteToHex, formatHexDump } from "../domain/format";
import { acceptFileBytes } from "../domain/hex-document";
import { selectionRange } from "../domain/selection";
import type { Endianness, HexColumn, OpenFailureReason, SearchMode } from "../types";
import {
    downloadBytes,
    isAbort,
    pickFileToOpen,
    pickFileToSave,
    readFile,
    supportsFileSystemAccess,
    writeThroughHandle,
} from "./file-access";
import { DataInspector } from "./data-inspector";
import { GoToDialog } from "./goto-dialog";
import { focusHexGrid, HexGrid } from "./hex-grid";
import { HexStatusBar } from "./hex-status-bar";
import { HexToolbar } from "./hex-toolbar";
import { SearchDock } from "./search-dock";
import { useHexStore } from "./hex-store";

/**
 * The whole editor: a toolbar, an inspector, the grid, and a status line.
 *
 * This is the only component that talks to the file system. Everything below it
 * reads the store, which is what keeps the grid ignorant of whether the bytes
 * arrived through a picker, a drop, or a fallback `<input type="file">`.
 *
 * The panel width, whether the inspector is open at all, and whether the editor
 * is full screen are all held here rather than in the store, because they are
 * chrome: dragging the divider is not something the undo stack should know
 * about, and neither is opening the find bar.
 */

const MIN_INSPECTOR_WIDTH = 200;
const MAX_INSPECTOR_WIDTH = 420;
const DEFAULT_INSPECTOR_WIDTH = 260;

export type HexEditorWorkbenchProps = {
    initialEndian: Endianness;
    initialColumn: HexColumn;
    initialSearchMode: SearchMode;
};

export function HexEditorWorkbench({
    initialEndian,
    initialColumn,
    initialSearchMode,
}: HexEditorWorkbenchProps) {
    const t = useTranslations("hexEditor.workbench");
    const tToolbar = useTranslations("hexEditor.toolbar");
    const tToast = useTranslations("hexEditor.toast");
    const tErrors = useTranslations("hexEditor.errors");
    const formatter = useFormatter();

    const document = useHexStore((state) => state.document);
    const fileName = useHexStore((state) => state.fileName);
    const selection = useHexStore((state) => state.selection);
    const openFile = useHexStore((state) => state.openFile);
    const closeFile = useHexStore((state) => state.closeFile);
    const reloadFile = useHexStore((state) => state.reloadFile);
    const markSaved = useHexStore((state) => state.markSaved);
    const requestScroll = useHexStore((state) => state.requestScroll);

    const inputRef = useRef<HTMLInputElement>(null);
    const handleRef = useRef<FileSystemFileHandle | null>(null);
    const dragOriginRef = useRef({ x: 0, width: DEFAULT_INSPECTOR_WIDTH });

    const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_INSPECTOR_WIDTH);
    const [inspectorOpen, setInspectorOpen] = useState(true);
    const [dragging, setDragging] = useState(false);
    const [dropping, setDropping] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchFocus, setSearchFocus] = useState(0);
    const [gotoOpen, setGotoOpen] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);

    const hydrated = useIsHydrated();

    /**
     * The store is a module singleton, so seeding it from the link's search
     * params happens on mount rather than during render: a render-time write
     * would run on the server too, where one module is shared by every request
     * in flight and two readers with different links would overwrite each
     * other. Nothing is open on the first paint, so there is nothing to flash.
     */
    useEffect(() => {
        useHexStore.setState({
            endian: initialEndian,
            column: initialColumn,
            searchMode: initialSearchMode,
        });

        return () => useHexStore.getState().closeFile();
    }, [initialEndian, initialColumn, initialSearchMode]);

    function describeOpenFailure(reason: OpenFailureReason): string {
        return reason === "empty_file"
            ? tErrors("emptyFile")
            : tErrors("tooLarge", {
                  max: formatter.number(Math.floor(MAX_FILE_BYTES / 1024 / 1024)),
              });
    }

    function accept(bytes: Uint8Array, name: string, handle: FileSystemFileHandle | null): void {
        const accepted = acceptFileBytes(bytes);

        if (!accepted.ok) {
            toast.error(describeOpenFailure(accepted.reason));

            return;
        }

        handleRef.current = handle;
        openFile(accepted.bytes, name);
        toast.success(tToast("opened", { name }));
    }

    async function handleOpen() {
        if (!supportsFileSystemAccess()) {
            inputRef.current?.click();

            return;
        }

        try {
            const opened = await pickFileToOpen();

            if (opened !== null) {
                accept(opened.bytes, opened.name, opened.handle);
            }
        } catch (caught) {
            if (isAbort(caught)) {
                return;
            }

            logEvent("error", "hex_editor.open_failed", { error: describeError(caught) });
            toast.error(tErrors("openFailed"));
        }
    }

    async function handleSave() {
        const current = useHexStore.getState().document;

        if (current === null) {
            return;
        }

        const bytes = current.save();
        const name = current.name;
        const handle = handleRef.current;

        try {
            if (handle !== null) {
                await writeThroughHandle(handle, bytes);
                markSaved(bytes, name);
                toast.success(tToast("saved", { name }));

                return;
            }

            // No handle: either the browser has no File System Access API, or
            // the file arrived by drop. Either way the honest outcome is a copy
            // in Downloads, and the toast says so rather than implying the
            // original was written.
            downloadBytes(bytes, name);
            markSaved(bytes, name);
            toast.success(tToast("downloaded", { name }));
        } catch (caught) {
            if (isAbort(caught)) {
                return;
            }

            logEvent("error", "hex_editor.save_failed", { error: describeError(caught) });
            toast.error(tErrors("saveFailed"));
        }
    }

    async function handleSaveAs() {
        const current = useHexStore.getState().document;

        if (current === null) {
            return;
        }

        const bytes = current.save();

        try {
            const handle = await pickFileToSave(current.name);

            if (handle === null) {
                downloadBytes(bytes, current.name);
                markSaved(bytes, current.name);
                toast.success(tToast("downloaded", { name: current.name }));

                return;
            }

            await writeThroughHandle(handle, bytes);
            handleRef.current = handle;
            markSaved(bytes, handle.name);
            toast.success(tToast("saved", { name: handle.name }));
        } catch (caught) {
            if (isAbort(caught)) {
                return;
            }

            logEvent("error", "hex_editor.save_as_failed", { error: describeError(caught) });
            toast.error(tErrors("saveFailed"));
        }
    }

    function selectedBytes(): Uint8Array | null {
        const current = useHexStore.getState().document;

        if (current === null) {
            return null;
        }

        const { start, end } = selectionRange(useHexStore.getState().selection);

        if (end - start > MAX_COPY_BYTES) {
            toast.error(
                tErrors("copyTooLarge", {
                    max: formatter.number(Math.floor(MAX_COPY_BYTES / 1024)),
                }),
            );

            return null;
        }

        return current.slice(start, end);
    }

    async function copyAs(render: (bytes: Uint8Array) => string) {
        const bytes = selectedBytes();

        if (bytes === null) {
            return;
        }

        const result = await copyText(render(bytes));

        if (result.ok) {
            toast.success(tToast("copied", { count: bytes.length }));

            return;
        }

        toast.error(result.reason === "denied" ? tToast("copyDenied") : tToast("copyUnsupported"));
    }

    // Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+F and Ctrl+G have to work while the
    // focus is in a dialog or on the toolbar, so they hang off the window rather
    // than off the grid — which is where every key that moves the caret lives.
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) {
                return;
            }

            const key = event.key.toLowerCase();

            if (key === "o") {
                event.preventDefault();
                void handleOpen();
            } else if (key === "s") {
                event.preventDefault();
                void (event.shiftKey ? handleSaveAs() : handleSave());
            } else if (key === "f" && useHexStore.getState().document !== null) {
                event.preventDefault();
                openSearch();
            } else if (key === "g" && useHexStore.getState().document !== null) {
                event.preventDefault();
                setGotoOpen(true);
            }
        }

        window.addEventListener("keydown", onKeyDown);

        return () => window.removeEventListener("keydown", onKeyDown);
    });

    /**
     * Full screen moves the whole editor into a dialog, which mounts a fresh
     * scroller at the top of the file. Asking for the caret's row on the way in
     * and on the way out is what stops the reader landing back at offset zero;
     * the selection itself is untouched.
     */
    function handleFullscreenChange(next: boolean) {
        requestScroll(useHexStore.getState().selection.focus);
        setFullscreen(next);
    }

    function openSearch() {
        setSearchOpen(true);
        // A counter rather than a flag: Ctrl+F pressed while the bar is already
        // open has to put the caret back in the field, and `searchOpen` has not
        // changed for an effect to notice.
        setSearchFocus((nonce) => nonce + 1);
    }

    function closeSearch() {
        setSearchOpen(false);
        focusHexGrid();
    }

    function handleDividerPointerDown(event: PointerEvent<HTMLDivElement>) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragOriginRef.current = { x: event.clientX, width: inspectorWidth };
        setDragging(true);
    }

    function handleDividerPointerMove(event: PointerEvent<HTMLDivElement>) {
        if (!dragging) {
            return;
        }

        const next = dragOriginRef.current.width + (event.clientX - dragOriginRef.current.x);

        setInspectorWidth(Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, next)));
    }

    const showDownloadNotice = hydrated && !supportsFileSystemAccess();

    /**
     * Everything the editor is, in one fragment, so full screen can render it in
     * a dialog without a second copy of the layout drifting from this one.
     */
    const body = (
        <>
            <HexToolbar
                onOpen={() => void handleOpen()}
                onSave={() => void handleSave()}
                onSaveAs={() => void handleSaveAs()}
                onReload={reloadFile}
                onClose={() => {
                    handleRef.current = null;
                    closeFile();
                }}
                onFind={() => (searchOpen ? closeSearch() : openSearch())}
                onGoTo={() => setGotoOpen(true)}
                onCopyHex={() => void copyAs((bytes) => [...bytes].map(byteToHex).join(" "))}
                onCopyText={() => void copyAs((bytes) => [...bytes].map(byteToAscii).join(""))}
                onCopyDump={() =>
                    void copyAs((bytes) => formatHexDump(bytes, selectionRange(selection).start))
                }
                onToggleInspector={() => setInspectorOpen((current) => !current)}
                onToggleFullscreen={() => handleFullscreenChange(!fullscreen)}
                searchOpen={searchOpen}
                inspectorOpen={inspectorOpen}
                fullscreen={fullscreen}
            />

            {/* The one thing this tool cannot promise, said where the controls
                are rather than only in the article. */}
            {showDownloadNotice && (
                <p className="text-muted-foreground border-border/70 shrink-0 border-b px-3 py-1.5 text-[0.6875rem] leading-normal">
                    {t("downloadNotice")}
                </p>
            )}

            <SearchDock open={searchOpen} focusNonce={searchFocus} onClose={closeSearch} />

            <div
                onDragOver={(event) => {
                    event.preventDefault();
                    setDropping(true);
                }}
                onDragLeave={() => setDropping(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDropping(false);

                    const file = event.dataTransfer.files.item(0);

                    if (file !== null) {
                        void readFile(file).then((opened) =>
                            accept(opened.bytes, opened.name, null),
                        );
                    }
                }}
                className={cn(
                    "relative flex flex-col lg:grid",
                    // Full screen gives the grid whatever the window has left
                    // after the toolbar, the find bar and the status line; the
                    // page keeps a fixed height, so the article below it does
                    // not move when a file is opened.
                    fullscreen ? "min-h-0 flex-1" : "h-[26rem] lg:h-[34rem]",
                    dropping && "ring-primary/60 ring-2 ring-inset",
                )}
                style={{
                    gridTemplateColumns: inspectorOpen
                        ? `${inspectorWidth}px 0.375rem minmax(0, 1fr)`
                        : "minmax(0, 1fr)",
                }}
            >
                {inspectorOpen && (
                    <aside className="border-border/70 order-2 max-h-56 min-w-0 overflow-hidden border-t lg:order-1 lg:max-h-none lg:border-t-0 lg:border-r">
                        <DataInspector onClose={() => setInspectorOpen(false)} />
                    </aside>
                )}

                {/* Keyboard-operable as well as draggable: a resize handle that
                    only answers a pointer is a control some readers cannot use. */}
                {inspectorOpen && (
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={t("resizeLabel")}
                        aria-valuenow={inspectorWidth}
                        aria-valuemin={MIN_INSPECTOR_WIDTH}
                        aria-valuemax={MAX_INSPECTOR_WIDTH}
                        tabIndex={0}
                        onPointerDown={handleDividerPointerDown}
                        onPointerMove={handleDividerPointerMove}
                        onPointerUp={() => setDragging(false)}
                        onKeyDown={(event) => {
                            const step = event.shiftKey ? 32 : 8;

                            if (event.key === "ArrowLeft") {
                                event.preventDefault();
                                setInspectorWidth((width) =>
                                    Math.max(MIN_INSPECTOR_WIDTH, width - step),
                                );
                            } else if (event.key === "ArrowRight") {
                                event.preventDefault();
                                setInspectorWidth((width) =>
                                    Math.min(MAX_INSPECTOR_WIDTH, width + step),
                                );
                            }
                        }}
                        className={cn(
                            "bg-border/40 hover:bg-primary/40 order-1 hidden cursor-col-resize transition-colors duration-150 lg:order-2 lg:block",
                            "focus-visible:bg-primary/60 focus-visible:outline-none",
                            dragging && "bg-primary/60",
                        )}
                    />
                )}

                <div className="order-1 min-h-0 min-w-0 flex-1 lg:order-3">
                    {document === null ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                            <IconUpload
                                className="text-muted-foreground/60 size-8"
                                stroke={1.5}
                                aria-hidden="true"
                            />
                            <div className="flex max-w-[42ch] flex-col gap-1">
                                <p className="text-foreground text-sm font-medium">
                                    {t("emptyTitle")}
                                </p>
                                <p className="text-muted-foreground text-[0.8125rem] leading-6">
                                    {t("emptyDescription")}
                                </p>
                            </div>
                            <Button size="sm" onClick={() => void handleOpen()}>
                                <IconFolderOpen
                                    className="size-3.5"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("openFile")}
                            </Button>
                        </div>
                    ) : (
                        <HexGrid />
                    )}
                </div>
            </div>

            <HexStatusBar />
        </>
    );

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                hidden
                onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (file !== undefined) {
                        void readFile(file).then((opened) =>
                            accept(opened.bytes, opened.name, null),
                        );
                    }

                    event.target.value = "";
                }}
            />

            <Card className="gap-0 overflow-hidden p-0">
                {fullscreen ? (
                    <div className="flex flex-col items-start gap-3 p-5">
                        <p className="text-muted-foreground text-[0.8125rem] leading-6">
                            {t("fullscreenActive")}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFullscreenChange(false)}
                        >
                            <IconArrowsMinimize
                                className="size-3.5"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {tToolbar("exitFullscreen")}
                        </Button>
                    </div>
                ) : (
                    body
                )}
            </Card>

            {/* A dialog rather than a positioned div: it is portalled to the
                document body, so no ancestor's transform, overflow or padding
                can reach it, and it brings the focus trap and the Escape key
                that a bare overlay would have to reinvent.

                Its heading is for screen readers only. The editor's own toolbar
                is already the top of this dialog, carries the file name, and
                holds the control that leaves — a second title bar would spend
                the vertical space full screen exists to give back. */}
            <Sheet open={fullscreen} onOpenChange={handleFullscreenChange}>
                <SheetContent
                    side="bottom"
                    showCloseButton={false}
                    className="bg-background text-foreground w-full max-w-none gap-0 rounded-none p-0 data-[side=bottom]:inset-0 data-[side=bottom]:h-full data-[side=bottom]:border-t-0 sm:max-w-none"
                >
                    <SheetTitle className="sr-only">{t("fullscreenTitle")}</SheetTitle>
                    <SheetDescription className="sr-only">
                        {t("fullscreenDescription")}
                    </SheetDescription>

                    <div className="flex h-full min-h-0 flex-1 flex-col">
                        {fullscreen ? body : null}
                    </div>
                </SheetContent>
            </Sheet>

            <GoToDialog open={gotoOpen} onOpenChange={setGotoOpen} />

            {fileName !== null && (
                <span className="sr-only">{t("openedFile", { name: fileName })}</span>
            )}
        </>
    );
}
