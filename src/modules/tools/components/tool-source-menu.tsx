"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
    IconAlertCircle,
    IconArrowUpRight,
    IconBrandGithub,
    IconChevronDown,
    IconCode,
    type TablerIcon,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ToolSourceLinks } from "../domain/tool-source";

/**
 * The "Improve" button in every tool header: one short label that fits beside
 * the breadcrumb on a phone, opening a menu with room for both full names and
 * a line on each. The links are worked out on the server and passed in.
 *
 * The items are Base UI's `LinkItem` — a real `<a>` that the menu still
 * drives by keyboard — composed here because the vendored dropdown only wraps
 * the button-like `Item`.
 */
export function ToolSourceMenu({
    links,
    className,
}: {
    links: ToolSourceLinks;
    className?: string;
}) {
    const t = useTranslations("toolSource");

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label={t("menuLabel")}
                className={cn(
                    // Full foreground on a card surface: the one action in the
                    // header, so it reads as a button rather than as metadata.
                    "text-foreground bg-card inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap shadow-xs",
                    "ring-border ring-1 transition-colors duration-200 ring-inset",
                    "hover:bg-muted data-popup-open:bg-muted",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    className,
                )}
            >
                <IconBrandGithub className="size-3.5 shrink-0" stroke={1.9} aria-hidden="true" />
                {t("trigger")}
                <IconChevronDown
                    className="text-muted-foreground size-3.5 shrink-0"
                    stroke={1.9}
                    aria-hidden="true"
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="w-auto max-w-[calc(100vw-2rem)] min-w-64"
            >
                <SourceLink
                    href={links.issueUrl}
                    Icon={IconAlertCircle}
                    title={t("report")}
                    hint={t("reportHint")}
                    newTab={t("newTab")}
                />
                <SourceLink
                    href={links.sourceUrl}
                    Icon={IconCode}
                    title={t("edit")}
                    hint={t("editHint")}
                    newTab={t("newTab")}
                />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

type SourceLinkProps = {
    href: string;
    Icon: TablerIcon;
    title: string;
    hint: string;
    newTab: string;
};

function SourceLink({ href, Icon, title, hint, newTab }: SourceLinkProps) {
    return (
        <MenuPrimitive.LinkItem
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            label={title}
            closeOnClick
            className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-sm outline-hidden select-none",
                "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
            )}
        >
            <Icon
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
                stroke={1.75}
                aria-hidden="true"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="leading-[1.3] font-medium">{title}</span>
                <span className="text-muted-foreground text-xs leading-[1.4]">{hint}</span>
            </span>
            <IconArrowUpRight
                className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                stroke={1.9}
                aria-hidden="true"
            />
            <span className="sr-only">{newTab}</span>
        </MenuPrimitive.LinkItem>
    );
}
