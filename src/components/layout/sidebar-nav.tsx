"use client";

import {
    IconDatabase,
    IconHistory,
    IconLayoutDashboard,
    IconPlugConnected,
    IconSearch,
    IconServer2,
    IconTopologyStar3,
    IconX,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    useId,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
    type RefObject,
} from "react";

import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
    removeRecentTool,
    useRecentToolIds,
} from "@/modules/preferences/components/use-recent-tools";
import { useOnline } from "@/hooks/use-online";
import { MAX_RECENT_TOOLS } from "@/modules/preferences/domain/recent-tools";
import { TOOL_ACCENT_VARS, TOOL_ICON_TILE } from "@/modules/tools/components/tool-accent";
import { ToolIcon } from "@/modules/tools/components/tool-icon";
import { MAX_TOOL_SEARCH_LENGTH, filterTools } from "@/modules/tools/domain/search";
import { needsNetwork } from "@/modules/tools/domain/network";
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
    /** Adds a hover-revealed × that calls this; `removeLabel` names it. */
    onRemove?: () => void;
    removeLabel?: string;
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
    onRemove,
    removeLabel,
}: NavRowProps) {
    const interactive = href !== undefined;
    const removable = onRemove !== undefined && !collapsed;

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
        // Room for the × so a long name truncates before it, not under it.
        removable && "pr-8",
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
        <li className="group/item relative">
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
            {removable && (
                // A sibling of the link, not inside it: a button nested in an
                // anchor is invalid and would also navigate. Hover-only would
                // strand keyboard and touch users, so focus and hover:none show it.
                <button
                    type="button"
                    aria-label={removeLabel}
                    onClick={(event) => {
                        // This row is about to unmount; hand focus to a
                        // neighbour rather than dropping it to <body>.
                        const item = event.currentTarget.closest("li");
                        const neighbour = (
                            item?.nextElementSibling ?? item?.previousElementSibling
                        )?.querySelector("a");
                        onRemove();
                        neighbour?.focus();
                    }}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md opacity-0 transition-[opacity,color,background-color] duration-200 group-hover/item:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none [@media(hover:none)]:opacity-100"
                >
                    <IconX className="size-3.5" stroke={2} aria-hidden="true" />
                </button>
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
                <span className="text-muted-foreground/85 flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.09em] uppercase">
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
    const searchHintId = useId();
    const navRef = useRef<HTMLElement>(null);
    const recentIds = useRecentToolIds();
    const online = useOnline();
    // Offline, a tool that needs the server is not offered at all — every list
    // and count below starts from what can still run.
    const reachable = useMemo(
        () => (online ? tools : tools.filter((tool) => !needsNetwork(tool))),
        [tools, online],
    );

    /**
     * Sections never enter a category group.
     *
     * Each studio already owns a row in the STUDIO block below, and `/mock`
     * matches both that row and a Network-category copy of itself — so both
     * read as active and hand two elements the same `layoutId`. Framer Motion
     * resolves that by keeping one, which is why the indicator *disappeared*
     * rather than doubling. `getToolsByCategory()` has always excluded them;
     * this is the rail agreeing with it.
     */
    const pages = useMemo(() => reachable.filter((tool) => tool.isSection !== true), [reachable]);

    /**
     * Which studios the current query matches, so a section stays findable by
     * search — the catalog test that keeps them out of every grid also requires
     * that. Empty query matches everything, which is what makes the block its
     * own default state rather than a special case.
     */
    const matchedSectionIds = useMemo(
        () =>
            new Set(
                filterTools(
                    reachable.filter((tool) => tool.isSection === true),
                    query,
                ).map((tool) => tool.id),
            ),
        [reachable, query],
    );

    const filtered = useMemo(() => filterTools(pages, query), [pages, query]);

    // The page you are on is left out: it is already highlighted in its own
    // category, and a second active row would share that row's `layoutId`.
    const recent = useMemo(
        () =>
            recentIds
                .flatMap((id) => {
                    const tool = pages.find((page) => page.id === id);

                    return tool?.status === "available" && tool.href !== pathname ? [tool] : [];
                })
                .slice(0, MAX_RECENT_TOOLS),
        [recentIds, pages, pathname],
    );

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
    const mcpActive = pathname === "/mcp";
    // Each studio is a route tree rather than a page, so every path beneath its
    // root belongs to it — `pathname === href` would drop the highlight the
    // moment somebody opened a workspace.
    const mockActive = pathname === "/mock" || pathname.startsWith("/mock/");
    const jsonActive = pathname === "/json" || pathname.startsWith("/json/");
    const graphqlActive = pathname === "/graphql" || pathname.startsWith("/graphql/");

    // While a query is typed the first link in the list is the top result —
    // read from the DOM so Enter always opens exactly what is shown first.
    function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        // Enter also commits an IME composition, which Bangla input uses.
        if (event.nativeEvent.isComposing) {
            return;
        }

        const first = navRef.current?.querySelector("a");

        if (!first) {
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            first.focus();
        } else if (event.key === "Enter" && query.length > 0) {
            event.preventDefault();
            first.click();
            setQuery("");
            event.currentTarget.blur();
        }
    }

    // Arrow keys step through the links; up from the first returns to search.
    function handleNavKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
            return;
        }

        const links = Array.from(event.currentTarget.querySelectorAll("a"));
        const index = links.findIndex((link) => link === document.activeElement);

        if (index === -1) {
            return;
        }

        event.preventDefault();

        const next = links[index + (event.key === "ArrowDown" ? 1 : -1)];

        if (next) {
            next.focus();
        } else if (event.key === "ArrowUp") {
            document.getElementById(searchId)?.focus();
        }
    }

    function renderRow(tool: LocalizedTool, onRemove?: () => void) {
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
                onRemove={onRemove}
                removeLabel={onRemove ? t("recentRemove", { name: tool.name }) : undefined}
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
                            // A filter over a few dozen tool names. Nothing past
                            // this can match anything, and a pasted novel would
                            // run the matcher over every entry on each keystroke.
                            maxLength={MAX_TOOL_SEARCH_LENGTH}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            aria-describedby={searchHintId}
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
                        <span id={searchHintId} className="sr-only">
                            {t("searchKeysHint")}
                        </span>
                    </div>
                )}
            </div>

            <nav
                ref={navRef}
                onKeyDown={handleNavKeyDown}
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
                            {/* General rather than Tools: the MCP guide is how
                                the toolbox is reached from somewhere else, not
                                another utility to sit between two of them.
                                Offline it is hidden: nothing keeps that page. */}
                            {online && (
                                <NavRow
                                    label={t("mcp")}
                                    href="/mcp"
                                    active={mcpActive}
                                    collapsed={collapsed}
                                    layoutIdPrefix={layoutIdPrefix}
                                    onNavigate={onNavigate}
                                    accentClass={TOOL_ACCENT_VARS.emerald}
                                    icon={
                                        <IconPlugConnected
                                            className="size-4"
                                            stroke={1.75}
                                            aria-hidden="true"
                                        />
                                    }
                                />
                            )}
                        </ul>
                    </>
                )}

                {query.length === 0 && recent.length > 0 && (
                    <>
                        <SectionLabel ruleWhenCollapsed>
                            <IconHistory className="size-3" stroke={2} aria-hidden="true" />
                            {t("sectionRecent")}
                        </SectionLabel>
                        <ul className="flex flex-col gap-0.5">
                            {recent.map((tool) => renderRow(tool, () => removeRecentTool(tool.id)))}
                        </ul>
                    </>
                )}

                {matchedSectionIds.size > 0 && (
                    <>
                        <SectionLabel
                            ruleWhenCollapsed
                            trailing={
                                <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-mono text-[0.625rem] leading-none tabular-nums">
                                    {format.number(matchedSectionIds.size)}
                                </span>
                            }
                        >
                            {t("sectionStudio")}
                        </SectionLabel>
                        <ul className="flex flex-col gap-0.5">
                            {matchedSectionIds.has("mock-server") && (
                                <NavRow
                                    label={t("mockServers")}
                                    href="/mock"
                                    active={mockActive}
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
                            )}
                            {matchedSectionIds.has("json-server") && (
                                <NavRow
                                    label={t("jsonServers")}
                                    href="/json"
                                    active={jsonActive}
                                    collapsed={collapsed}
                                    layoutIdPrefix={layoutIdPrefix}
                                    onNavigate={onNavigate}
                                    accentClass={TOOL_ACCENT_VARS.amber}
                                    icon={
                                        <IconDatabase
                                            className="size-4"
                                            stroke={1.75}
                                            aria-hidden="true"
                                        />
                                    }
                                />
                            )}
                            {matchedSectionIds.has("graphql-server") && (
                                <NavRow
                                    label={t("graphqlServers")}
                                    href="/graphql"
                                    active={graphqlActive}
                                    collapsed={collapsed}
                                    layoutIdPrefix={layoutIdPrefix}
                                    onNavigate={onNavigate}
                                    accentClass={TOOL_ACCENT_VARS.rose}
                                    icon={
                                        <IconTopologyStar3
                                            className="size-4"
                                            stroke={1.75}
                                            aria-hidden="true"
                                        />
                                    }
                                />
                            )}
                        </ul>
                    </>
                )}

                {/* Three states, in the order they are decided: browsing,
                    a search with page results, and a search with none. The last
                    one renders nothing at all when a studio above matched it —
                    "no tools match" under a row that plainly does is worse than
                    silence. */}
                {query.length > 0 ? (
                    filtered.length > 0 ? (
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
                            <ul className="flex flex-col gap-0.5">
                                {filtered.map((tool) => renderRow(tool))}
                            </ul>
                        </>
                    ) : (
                        matchedSectionIds.size === 0 && (
                            <>
                                <SectionLabel ruleWhenCollapsed>{t("sectionTools")}</SectionLabel>
                                <p className="text-muted-foreground px-2 py-6 text-center text-xs group-data-[collapsed=true]/shell:hidden">
                                    {t("searchEmpty", { query })}
                                    <span className="text-muted-foreground/70 mt-1 block">
                                        {t("searchEmptyHint")}
                                    </span>
                                </p>
                            </>
                        )
                    )
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
                            <ul className="flex flex-col gap-0.5">
                                {group.tools.map((tool) => renderRow(tool))}
                            </ul>
                        </div>
                    ))
                )}
            </nav>
        </div>
    );
}
