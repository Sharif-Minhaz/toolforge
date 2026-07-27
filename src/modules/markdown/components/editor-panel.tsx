"use client";

import { useTranslations } from "next-intl";
import type { KeyboardEvent, RefObject, UIEvent } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { MarkdownEditAction } from "../types";
import { EditorToolbar } from "./editor-toolbar";

/** Shortcuts a writer expects, keyed off the physical letter. */
const SHORTCUTS: Readonly<Record<string, MarkdownEditAction>> = {
    b: "bold",
    i: "italic",
    k: "link",
};

type EditorPanelProps = {
    text: string;
    inputId: string;
    labelId: string;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    onChange: (value: string) => void;
    onAction: (action: MarkdownEditAction) => void;
    onScroll: (event: UIEvent<HTMLTextAreaElement>) => void;
    /** Stretches to whatever height the parent gives it, for the full-screen overlay. */
    fill?: boolean;
};

export function EditorPanel({
    text,
    inputId,
    labelId,
    textareaRef,
    onChange,
    onAction,
    onScroll,
    fill = false,
}: EditorPanelProps) {
    const t = useTranslations("markdown.workbench");

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        // `metaKey` on macOS, `ctrlKey` everywhere else. `altKey` is excluded so
        // AltGr layouts — where AltGr reports as Ctrl+Alt — can still type.
        if (!(event.metaKey || event.ctrlKey) || event.altKey) {
            return;
        }

        const action = SHORTCUTS[event.key.toLowerCase()];

        if (action === undefined) {
            return;
        }

        event.preventDefault();
        onAction(action);
    }

    return (
        // `h-full` from `lg` up, where the two panes sit side by side: the grid
        // row gives both sections the same height and the textarea takes what is
        // left under the toolbar, so the two boxes end on the same line however
        // many rows the toolbar wraps to.
        <section
            className={cn("flex min-w-0 flex-col gap-2", fill ? "h-full min-h-0" : "lg:h-full")}
        >
            <Label id={labelId} htmlFor={inputId} className="text-muted-foreground text-xs">
                {t("editorLabel")}
            </Label>

            <EditorToolbar onAction={onAction} labelId={labelId} />

            <Textarea
                id={inputId}
                ref={textareaRef}
                value={text}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={onScroll}
                placeholder={t("editorPlaceholder")}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                // `field-sizing-fixed` undoes the shared textarea's auto-growth:
                // this pane has to keep a stable height so the preview beside it
                // can be scrolled to the same place.
                className={cn(
                    "bg-card/70 field-sizing-fixed min-h-0 resize-none overflow-auto rounded-xl font-mono text-[0.8125rem] leading-6",
                    fill ? "h-full flex-1" : "h-96 lg:h-auto lg:flex-1",
                )}
            />
        </section>
    );
}
