"use client";

import {
    IconArrowBackUp,
    IconArrowForwardUp,
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconChevronDown,
    IconClipboard,
    IconDeviceFloppy,
    IconFileExport,
    IconFolderOpen,
    IconLayoutSidebar,
    IconLayoutSidebarFilled,
    IconRefresh,
    IconSearch,
    IconTargetArrow,
    IconX,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { HEX_COLUMNS } from "../types";
import { HexIconButton } from "./hex-icon-button";
import { selectCanRedo, selectCanUndo, selectIsDirty, useHexStore } from "./hex-store";

/**
 * The row of controls above the grid. Dumb by construction: every button calls
 * a prop, and the only state it reads is what has to grey a control out.
 *
 * Every square control is a `HexIconButton`, which carries the name and the
 * shortcut in a tooltip rather than beside the icon — so the row still fits at
 * 390 px and nothing is announced only by a picture.
 */

export type HexToolbarProps = {
    onOpen: () => void;
    onSave: () => void;
    onSaveAs: () => void;
    onReload: () => void;
    onClose: () => void;
    onFind: () => void;
    onGoTo: () => void;
    onCopyHex: () => void;
    onCopyText: () => void;
    onCopyDump: () => void;
    onToggleInspector: () => void;
    onToggleFullscreen: () => void;
    searchOpen: boolean;
    inspectorOpen: boolean;
    fullscreen: boolean;
};

export function HexToolbar({
    onOpen,
    onSave,
    onSaveAs,
    onReload,
    onClose,
    onFind,
    onGoTo,
    onCopyHex,
    onCopyText,
    onCopyDump,
    onToggleInspector,
    onToggleFullscreen,
    searchOpen,
    inspectorOpen,
    fullscreen,
}: HexToolbarProps) {
    const t = useTranslations("hexEditor.toolbar");
    const tColumns = useTranslations("hexEditor.columns");

    const document = useHexStore((state) => state.document);
    const fileName = useHexStore((state) => state.fileName);
    const column = useHexStore((state) => state.column);
    const setColumn = useHexStore((state) => state.setColumn);
    const undoEdit = useHexStore((state) => state.undoEdit);
    const redoEdit = useHexStore((state) => state.redoEdit);
    const canUndo = useHexStore(selectCanUndo);
    const canRedo = useHexStore(selectCanRedo);
    const dirty = useHexStore(selectIsDirty);

    const open = document !== null;

    return (
        <div className="border-border/70 flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5">
            <HexIconButton
                label={t("open")}
                shortcut="Ctrl+O"
                Icon={IconFolderOpen}
                onClick={onOpen}
            />
            <HexIconButton
                label={t("save")}
                shortcut="Ctrl+S"
                Icon={IconDeviceFloppy}
                onClick={onSave}
                disabled={!open}
            />
            <HexIconButton
                label={t("saveAs")}
                shortcut="Ctrl+Shift+S"
                Icon={IconFileExport}
                onClick={onSaveAs}
                disabled={!open}
            />
            <HexIconButton
                label={t("reload")}
                Icon={IconRefresh}
                onClick={onReload}
                disabled={!open}
            />

            <Separator orientation="vertical" className="mx-1 h-5" />

            <HexIconButton
                label={t("undo")}
                shortcut="Ctrl+Z"
                Icon={IconArrowBackUp}
                onClick={undoEdit}
                disabled={!canUndo}
            />
            <HexIconButton
                label={t("redo")}
                shortcut="Ctrl+Y"
                Icon={IconArrowForwardUp}
                onClick={redoEdit}
                disabled={!canRedo}
            />

            <Separator orientation="vertical" className="mx-1 h-5" />

            <HexIconButton
                label={t("find")}
                shortcut="Ctrl+F"
                Icon={IconSearch}
                onClick={onFind}
                disabled={!open}
                pressed={searchOpen}
            />
            <HexIconButton
                label={t("goTo")}
                shortcut="Ctrl+G"
                Icon={IconTargetArrow}
                onClick={onGoTo}
                disabled={!open}
            />

            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <button
                            type="button"
                            disabled={!open}
                            className={cn(
                                "text-muted-foreground flex h-8 shrink-0 items-center gap-1 rounded-lg px-2",
                                "hover:bg-muted hover:text-foreground text-xs transition-colors duration-200",
                                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                "disabled:pointer-events-none disabled:opacity-40",
                            )}
                        >
                            <IconClipboard className="size-4" stroke={1.8} aria-hidden="true" />
                            {t("copy")}
                            <IconChevronDown className="size-3" stroke={2} aria-hidden="true" />
                        </button>
                    }
                />
                <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={onCopyHex}>{t("copyHex")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={onCopyText}>{t("copyText")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={onCopyDump}>{t("copyDump")}</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Separator orientation="vertical" className="mx-1 h-5" />

            {/* Which half of the grid types. Tab swaps them from the keyboard. */}
            <div
                role="group"
                aria-label={t("columnGroup")}
                className="bg-muted/50 flex shrink-0 items-center gap-0.5 rounded-lg p-0.5"
            >
                {HEX_COLUMNS.map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setColumn(value)}
                        aria-pressed={column === value}
                        className={cn(
                            "rounded-md px-2 py-1 text-[0.6875rem] font-medium transition-colors duration-200",
                            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                            column === value
                                ? "bg-card text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {tColumns(value)}
                    </button>
                ))}
            </div>

            <Separator orientation="vertical" className="mx-1 h-5" />

            {/* Both of these change how much of the window the grid gets, which
                is the one thing a reader of a hex dump is always short of. They
                are toggles rather than buttons, so they say what state they are
                in rather than what pressing them would do. */}
            <HexIconButton
                label={inspectorOpen ? t("hideInspector") : t("showInspector")}
                Icon={inspectorOpen ? IconLayoutSidebarFilled : IconLayoutSidebar}
                onClick={onToggleInspector}
                pressed={inspectorOpen}
            />
            <HexIconButton
                label={fullscreen ? t("exitFullscreen") : t("fullscreen")}
                Icon={fullscreen ? IconArrowsMinimize : IconArrowsMaximize}
                onClick={onToggleFullscreen}
                pressed={fullscreen}
            />

            <div className="ml-auto flex min-w-0 items-center gap-1.5 pl-2">
                {fileName !== null && (
                    <span
                        title={fileName}
                        className="text-muted-foreground min-w-0 truncate font-mono text-[0.6875rem]"
                    >
                        {dirty ? `${fileName} •` : fileName}
                    </span>
                )}
                {open && (
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onClose}
                        aria-label={t("close")}
                    >
                        <IconX className="size-4" stroke={1.8} aria-hidden="true" />
                    </Button>
                )}
            </div>
        </div>
    );
}
