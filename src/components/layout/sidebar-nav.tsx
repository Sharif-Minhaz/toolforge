"use client";

import { IconLayoutDashboard, IconSearch, IconServer2, IconX } from "@tabler/icons-react";
import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useMemo, useState, type ReactNode, type RefObject } from "react";

import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TOOL_ACCENT_VARS, TOOL_ICON_TILE } from "@/modules/tools/components/tool-accent";
import { ToolIcon } from "@/modules/tools/components/tool-icon";
import { filterTools } from "@/modules/tools/domain/search";
import { TOOL_CATEGORIES, type LocalizedTool } from "@/modules/tools/types";

const INDICATOR_SPRING = { type: "spring", stiffness: 460, damping: 38, mass: 0.7 } as const;

type NavRowProps = {
    label: string;
    active: boolean;
    collapsed: boolean;
    icon: ReactNode;
    href?: string;
    badge?: ReactNode;
    accentClass?: string;
    layoutIdPrefix: string;
    onNavigate?: () => void;
};

function NavRow({
    label,
    active,
    collapsed,
    icon,
    href,
    badge,
    accentClass,
    layoutIdPrefix,
    onNavigate,
}: NavRowProps) {
    const interactive = href !== undefined;

    const content = (
        <>
            <span
                className={cn(
                    TOOL_ICON_TILE,
                    "size-7 transition-transform duration-200 group-hover/row:scale-[1.06]",
                )}
            >
                {icon}
            </span>
            <span
                className={cn(
                    "min-w-0 flex-1 truncate text-left text-[0.8125rem] font-medium transition-opacity duration-200",
                    // Zero-width rather than faded: a flex-1 label still claims
                    // space at opacity 0 and shoves the icon off centre.
                    collapsed && "pointer-events-none w-0 flex-none opacity-0",
                )}
            >
                {label}
            </span>
            {badge !== undefined && (
                <span
                    className={cn(
                        "shrink-0 transition-opacity duration-200",
                        collapsed && "hidden",
                    )}
                >
                    {badge}
                </span>
            )}
        </>
    );

    const rowClassName = cn(
        "group/row relative flex h-10 w-full items-center gap-2.5 rounded-xl px-1.5 outline-none",
        "transition-colors duration-200",
        accentClass,
        interactive
            ? "hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
            : "cursor-default opacity-55",
        active && "hover:bg-transparent",
        collapsed && "justify-center gap-0",
    );

    const row = interactive ? (
        <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={rowClassName}
        >
            {content}
        </Link>
    ) : (
        <span aria-disabled="true" className={rowClassName}>
            {content}
        </span>
    );

    return (
        <li className="relative">
            {active && (
                <>
                    <motion.span
                        layoutId={`${layoutIdPrefix}-nav-pill`}
                        transition={INDICATOR_SPRING}
                        className="bg-sidebar-accent ring-border/70 absolute inset-0 rounded-xl shadow-[0_1px_2px_oklch(0_0_0/0.07)] ring-1"
                    />
                    <motion.span
                        layoutId={`${layoutIdPrefix}-nav-bar`}
                        transition={INDICATOR_SPRING}
                        className="bg-primary absolute top-1/2 -left-2 h-4.5 w-0.75 -translate-y-1/2 rounded-full"
                    />
                </>
            )}
            {collapsed ? (
                <Tooltip>
                    <TooltipTrigger render={row} />
                    <TooltipContent side="right" sideOffset={14}>
                        {label}
                    </TooltipContent>
                </Tooltip>
            ) : (
                row
            )}
        </li>
    );
}

type SectionLabelProps = {
    children: ReactNode;
    trailing?: ReactNode;
    /** Draws a hairline in place of the heading once the rail is icon-only. */
    ruleWhenCollapsed?: boolean;
};

function SectionLabel({ children, trailing, ruleWhenCollapsed }: SectionLabelProps) {
    return (
        <>
            <div className="flex items-center justify-between gap-2 px-2 pt-5 pb-1.5 group-data-[collapsed=true]/shell:sr-only">
                <span className="text-muted-foreground/85 text-[0.6875rem] font-semibold tracking-[0.09em] uppercase">
                    {children}
                </span>
                {trailing}
            </div>
            {ruleWhenCollapsed && (
                <div
                    aria-hidden="true"
                    className="bg-border/70 mx-auto hidden h-px w-6 group-data-[collapsed=true]/shell:my-2.5 group-data-[collapsed=true]/shell:block"
                />
            )}
        </>
    );
}

type SidebarNavProps = {
    tools: readonly LocalizedTool[];
    collapsed: boolean;
    layoutIdPrefix: string;
    searchRef?: RefObject<HTMLInputElement | null>;
    onNavigate?: () => void;
    onSearchFocusRequest?: () => void;
};

export function SidebarNav({
    tools,
    collapsed,
    layoutIdPrefix,
    searchRef,
    onNavigate,
    onSearchFocusRequest,
}: SidebarNavProps) {
    const t = useTranslations("nav");
    const tCommon = useTranslations("common");
    const format = useFormatter();
    const pathname = usePathname();
    const [query, setQuery] = useState("");
    const searchId = useId();

    const filtered = useMemo(() => filterTools(tools, query), [tools, query]);

    // Grouped only while browsing. A search is already a ranking, and slicing
    // three matches across five headings buries them.
    const groups = useMemo(
        () =>
            TOOL_CATEGORIES.map((category) => ({
                category,
                label: filtered.find((tool) => tool.category === category)?.categoryLabel ?? "",
                tools: filtered.filter((tool) => tool.category === category),
            })).filter((group) => group.tools.length > 0),
        [filtered],
    );

    const overviewActive = pathname === "/";
    // A section rather than a catalog entry: the studio is a route tree, not a
    // page, so it is not one of `tools` and does not appear under a category.
    const studioActive = pathname === "/mock" || pathname.startsWith("/mock/");

    function renderRow(tool: LocalizedTool) {
        const available = tool.status === "available";

        return (
            <NavRow
                key={tool.id}
                label={tool.name}
                href={available ? tool.href : undefined}
                active={available && pathname === tool.href}
                collapsed={collapsed}
                layoutIdPrefix={layoutIdPrefix}
                onNavigate={onNavigate}
                accentClass={TOOL_ACCENT_VARS[tool.accent]}
                icon={<ToolIcon name={tool.icon} className="size-4" />}
                badge={
                    available ? undefined : (
                        <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-1 text-[0.625rem] leading-[1.3] font-medium">
                            {tCommon("soon")}
                        </span>
                    )
                }
            />
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-2 pb-1">
                {collapsed ? (
                    <button
                        type="button"
                        aria-label={t("searchLabel")}
                        onClick={onSearchFocusRequest}
                        className="text-muted-foreground ring-border/70 hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:ring-ring flex h-9 w-full items-center justify-center rounded-xl ring-1 transition-colors duration-200 ring-inset focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <IconSearch className="size-4" stroke={1.9} aria-hidden="true" />
                    </button>
                ) : (
                    <div className="relative">
                        <label htmlFor={searchId} className="sr-only">
                            {t("searchLabel")}
                        </label>
                        <IconSearch
                            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                            stroke={1.9}
                            aria-hidden="true"
                        />
                        <Input
                            id={searchId}
                            ref={searchRef}
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t("searchPlaceholder")}
                            autoComplete="off"
                            className="bg-card/70 h-9 rounded-xl pr-9 pl-8 text-[0.8125rem] shadow-xs [&::-webkit-search-cancel-button]:hidden"
                        />
                        {query.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                aria-label={t("searchClear")}
                                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                            >
                                <IconX className="size-3.5" stroke={2} aria-hidden="true" />
                            </button>
                        ) : (
                            <kbd
                                aria-hidden="true"
                                className="bg-muted text-muted-foreground ring-border/70 pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-[0.3rem] px-1.5 py-0.5 font-mono text-[0.625rem] leading-none font-medium ring-1 ring-inset"
                            >
                                ⌘K
                            </kbd>
                        )}
                    </div>
                )}
            </div>

            <nav
                aria-label={t("primaryLabel")}
                className="scroll-fade-b no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3"
            >
                {query.length === 0 && (
                    <>
                        <SectionLabel>{t("sectionGeneral")}</SectionLabel>
                        <ul className="flex flex-col gap-0.5">
                            <NavRow
                                label={t("overview")}
                                href="/"
                                active={overviewActive}
                                collapsed={collapsed}
                                layoutIdPrefix={layoutIdPrefix}
                                onNavigate={onNavigate}
                                accentClass={TOOL_ACCENT_VARS.violet}
                                icon={
                                    <IconLayoutDashboard
                                        className="size-4"
                                        stroke={1.75}
                                        aria-hidden="true"
                                    />
                                }
                            />
                        </ul>

                        <SectionLabel ruleWhenCollapsed>{t("sectionStudio")}</SectionLabel>
                        <ul className="flex flex-col gap-0.5">
                            <NavRow
                                label={t("mockServers")}
                                href="/mock"
                                active={studioActive}
                                collapsed={collapsed}
                                layoutIdPrefix={layoutIdPrefix}
                                onNavigate={onNavigate}
                                accentClass={TOOL_ACCENT_VARS.cyan}
                                icon={
                                    <IconServer2
                                        className="size-4"
                                        stroke={1.75}
                                        aria-hidden="true"
                                    />
                                }
                            />
                        </ul>
                    </>
                )}

                {filtered.length === 0 ? (
                    <>
                        <SectionLabel ruleWhenCollapsed>{t("sectionTools")}</SectionLabel>
                        <p className="text-muted-foreground px-2 py-6 text-center text-xs group-data-[collapsed=true]/shell:hidden">
                            {t("searchEmpty", { query })}
                            <span className="text-muted-foreground/70 mt-1 block">
                                {t("searchEmptyHint")}
                            </span>
                        </p>
                    </>
                ) : query.length > 0 ? (
                    <>
                        <SectionLabel
                            ruleWhenCollapsed
                            trailing={
                                <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-mono text-[0.625rem] leading-none tabular-nums">
                                    {format.number(filtered.length)}
                                </span>
                            }
                        >
                            {t("sectionTools")}
                        </SectionLabel>
                        <ul className="flex flex-col gap-0.5">{filtered.map(renderRow)}</ul>
                    </>
                ) : (
                    groups.map((group) => (
                        <div key={group.category}>
                            <SectionLabel
                                ruleWhenCollapsed
                                trailing={
                                    <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-mono text-[0.625rem] leading-none tabular-nums">
                                        {format.number(group.tools.length)}
                                    </span>
                                }
                            >
                                {group.label}
                            </SectionLabel>
                            <ul className="flex flex-col gap-0.5">{group.tools.map(renderRow)}</ul>
                        </div>
                    ))
                )}
            </nav>
        </div>
    );
}
