"use client";

import {
    IconArrowBackUp,
    IconArrowForwardUp,
    IconChevronDown,
    IconClipboard,
    IconDeviceFloppy,
    IconFileExport,
    IconFolderOpen,
    IconRefresh,
    IconSearch,
    IconTargetArrow,
    IconX,
    type IconProps,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { HEX_COLUMNS } from "../types";
import { selectCanRedo, selectCanUndo, selectIsDirty, useHexStore } from "./hex-store";

/**
 * The row of controls above the grid. Dumb by construction: every button calls
 * a prop, and the only state it reads is what has to grey a control out.
 *
 * Each icon button carries its shortcut in the tooltip rather than beside the
 * label, so the toolbar stays one row at 390 px and the shortcut is still
 * discoverable by anyone who hovers or focuses it.
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
};

type ToolbarButtonProps = {
    label: string;
    shortcut?: string;
    Icon: ComponentType<IconProps>;
    onClick: () => void;
    disabled?: boolean;
};

function ToolbarButton({ label, shortcut, Icon, onClick, disabled }: ToolbarButtonProps) {
    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <button
                        type="button"
                        onClick={onClick}
                        disabled={disabled}
                        aria-label={label}
                        className={cn(
                            "text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg",
                            "hover:bg-muted hover:text-foreground transition-colors duration-200",
                            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                            "disabled:pointer-events-none disabled:opacity-40",
                        )}
                    >
                        <Icon className="size-4" stroke={1.8} aria-hidden="true" />
                    </button>
                }
            />
            <TooltipContent>
                {label}
                {shortcut !== undefined && (
                    <span className="text-muted-foreground ml-1.5 font-mono text-[0.6875rem]">
                        {shortcut}
                    </span>
                )}
            </TooltipContent>
        </Tooltip>
    );
}

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
        <div className="border-border/70 flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
            <ToolbarButton
                label={t("open")}
                shortcut="Ctrl+O"
                Icon={IconFolderOpen}
                onClick={onOpen}
            />
            <ToolbarButton
                label={t("save")}
                shortcut="Ctrl+S"
                Icon={IconDeviceFloppy}
                onClick={onSave}
                disabled={!open}
            />
            <ToolbarButton
                label={t("saveAs")}
                shortcut="Ctrl+Shift+S"
                Icon={IconFileExport}
                onClick={onSaveAs}
                disabled={!open}
            />
            <ToolbarButton
                label={t("reload")}
                Icon={IconRefresh}
                onClick={onReload}
                disabled={!open}
            />

            <Separator orientation="vertical" className="mx-1 h-5" />

            <ToolbarButton
                label={t("undo")}
                shortcut="Ctrl+Z"
                Icon={IconArrowBackUp}
                onClick={undoEdit}
                disabled={!canUndo}
            />
            <ToolbarButton
                label={t("redo")}
                shortcut="Ctrl+Y"
                Icon={IconArrowForwardUp}
                onClick={redoEdit}
                disabled={!canRedo}
            />

            <Separator orientation="vertical" className="mx-1 h-5" />

            <ToolbarButton
                label={t("find")}
                shortcut="Ctrl+F"
                Icon={IconSearch}
                onClick={onFind}
                disabled={!open}
            />
            <ToolbarButton
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
