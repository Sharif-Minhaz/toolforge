"use client";

import {
    IconBlockquote,
    IconBold,
    IconCode,
    IconH1,
    IconH2,
    IconH3,
    IconItalic,
    IconLink,
    IconList,
    IconListCheck,
    IconListNumbers,
    IconMinus,
    IconPhoto,
    IconStrikethrough,
    IconTable,
    IconTerminal2,
    type IconProps,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MarkdownEditAction } from "../types";

type ToolbarGroup = readonly {
    readonly action: MarkdownEditAction;
    readonly Icon: ComponentType<IconProps>;
}[];

/**
 * Grouped the way the actions are thought about — structure, then emphasis,
 * then lists, then the things that get inserted whole.
 */
const GROUPS: readonly ToolbarGroup[] = [
    [
        { action: "heading1", Icon: IconH1 },
        { action: "heading2", Icon: IconH2 },
        { action: "heading3", Icon: IconH3 },
    ],
    [
        { action: "bold", Icon: IconBold },
        { action: "italic", Icon: IconItalic },
        { action: "strikethrough", Icon: IconStrikethrough },
        { action: "inlineCode", Icon: IconCode },
    ],
    [
        { action: "bulletList", Icon: IconList },
        { action: "orderedList", Icon: IconListNumbers },
        { action: "taskList", Icon: IconListCheck },
        { action: "quote", Icon: IconBlockquote },
    ],
    [
        { action: "link", Icon: IconLink },
        { action: "image", Icon: IconPhoto },
        { action: "codeBlock", Icon: IconTerminal2 },
        { action: "table", Icon: IconTable },
        { action: "rule", Icon: IconMinus },
    ],
];

type EditorToolbarProps = {
    onAction: (action: MarkdownEditAction) => void;
    /** Names the toolbar for assistive technology; the label lives above it. */
    labelId: string;
};

export function EditorToolbar({ onAction, labelId }: EditorToolbarProps) {
    const t = useTranslations("markdown.actions");

    return (
        <div
            role="toolbar"
            aria-labelledby={labelId}
            aria-orientation="horizontal"
            className="bg-muted/50 ring-border/60 flex flex-wrap items-center gap-0.5 rounded-xl p-1 ring-1 ring-inset"
        >
            {GROUPS.map((group, index) => (
                <div key={group[0].action} className="flex items-center gap-0.5">
                    {index > 0 && (
                        <span
                            aria-hidden="true"
                            className="bg-border/70 mx-1 hidden h-5 w-px sm:block"
                        />
                    )}
                    {group.map(({ action, Icon }) => (
                        <Tooltip key={action}>
                            <TooltipTrigger
                                render={
                                    <button
                                        type="button"
                                        onClick={() => onAction(action)}
                                        aria-label={t(action)}
                                        className={cn(
                                            buttonVariants({ variant: "ghost", size: "icon-sm" }),
                                            "text-muted-foreground hover:text-foreground",
                                        )}
                                    />
                                }
                            >
                                <Icon className="size-4" stroke={1.8} aria-hidden="true" />
                            </TooltipTrigger>
                            <TooltipContent side="bottom">{t(action)}</TooltipContent>
                        </Tooltip>
                    ))}
                </div>
            ))}
        </div>
    );
}
