"use client";

import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
    IconMenu2,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
    type TouchEvent,
} from "react";

import { ToolForgeMark, ToolForgeWordmark } from "@/components/brand/toolforge-mark";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { persistSidebarState } from "@/modules/preferences/domain/sidebar";
import { LocaleSwitcher } from "./locale-switcher";
import type { LocalizedTool } from "@/modules/tools/types";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

const EXPANDED_WIDTH = "17rem";
const COLLAPSED_WIDTH = "4.75rem";
/** Matches the CSS transition below so the rail and the content move as one. */
const SHELL_EASING = "transition-[width,padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]";
const SWIPE_CLOSE_THRESHOLD = 72;

type ShellFrameProps = {
    tools: readonly LocalizedTool[];
    defaultCollapsed: boolean;
    children: ReactNode;
};

export function ShellFrame({ tools, defaultCollapsed, children }: ShellFrameProps) {
    const t = useTranslations("nav");
    const tCommon = useTranslations("common");

    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [mobileOpen, setMobileOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const focusSearchOnExpand = useRef(false);

    const setCollapsedState = useCallback((next: boolean) => {
        setCollapsed(next);
        persistSidebarState(next);
    }, []);

    const requestSearchFocus = useCallback(() => {
        if (!collapsed) {
            searchRef.current?.focus();

            return;
        }

        // The input only exists once the rail is expanded, so the focus is
        // deferred to the effect below rather than fired from here.
        focusSearchOnExpand.current = true;
        setCollapsedState(false);
    }, [collapsed, setCollapsedState]);

    useEffect(() => {
        if (collapsed || !focusSearchOnExpand.current) {
            return;
        }

        focusSearchOnExpand.current = false;
        searchRef.current?.focus();
    }, [collapsed]);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (!event.metaKey && !event.ctrlKey) {
                return;
            }

            const key = event.key.toLowerCase();

            if (key === "k") {
                event.preventDefault();
                requestSearchFocus();
            } else if (key === "b") {
                event.preventDefault();
                setCollapsedState(!collapsed);
            }
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [collapsed, requestSearchFocus, setCollapsedState]);

    return (
        <div
            className="group/shell relative isolate min-h-dvh"
            data-collapsed={collapsed}
            style={
                {
                    "--sidebar-w": collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
                } as CSSProperties
            }
        >
            <ShellBackdrop />

            <a
                href="#main-content"
                className="bg-primary text-primary-foreground sr-only rounded-lg px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100"
            >
                {tCommon("skipToContent")}
            </a>

            {/* ------------------------------------------------ desktop rail */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-40 hidden w-[calc(var(--sidebar-w)+1.5rem)] p-3 lg:block",
                    SHELL_EASING,
                )}
            >
                <div className="panel-sheen bg-sidebar/75 ring-sidebar-border flex h-full flex-col overflow-hidden rounded-2xl shadow-[0_1px_2px_oklch(0_0_0/0.04),0_12px_32px_-12px_oklch(0_0_0/0.12)] ring-1 backdrop-blur-xl">
                    <div
                        className={cn(
                            "flex gap-2 px-3 pt-3 pb-1",
                            collapsed ? "flex-col items-center gap-1.5" : "items-center",
                        )}
                    >
                        {/* The mark is decorative and the wordmark disappears in
                            the collapsed rail, so the name lives on the link. */}
                        <Link
                            href="/"
                            aria-label={t("home")}
                            className={cn(
                                "focus-visible:ring-ring flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2",
                                !collapsed && "flex-1",
                            )}
                        >
                            <ToolForgeMark />
                            {!collapsed && (
                                <span className="min-w-0 truncate">
                                    <ToolForgeWordmark />
                                </span>
                            )}
                        </Link>
                        {/* Stays visible in both states — a hover-only control would
                            strand keyboard and touch users in the collapsed rail. */}
                        <button
                            type="button"
                            onClick={() => setCollapsedState(!collapsed)}
                            aria-label={collapsed ? t("expand") : t("collapse")}
                            aria-expanded={!collapsed}
                            className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-ring grid size-7 shrink-0 place-items-center rounded-lg transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                        >
                            {collapsed ? (
                                <IconLayoutSidebarLeftExpand
                                    className="size-4"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                            ) : (
                                <IconLayoutSidebarLeftCollapse
                                    className="size-4"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                            )}
                        </button>
                    </div>

                    <SidebarNav
                        tools={tools}
                        collapsed={collapsed}
                        layoutIdPrefix="desktop"
                        searchRef={searchRef}
                        onSearchFocusRequest={requestSearchFocus}
                    />

                    <div className="border-sidebar-border flex items-center justify-between gap-2 border-t px-3 py-2.5 group-data-[collapsed=true]/shell:flex-col group-data-[collapsed=true]/shell:gap-1.5">
                        <ThemeToggle
                            layoutIdPrefix="desktop"
                            className="group-data-[collapsed=true]/shell:flex-col"
                        />
                        <LocaleSwitcher />
                    </div>
                </div>
            </aside>

            {/* ------------------------------------------------- mobile chrome */}
            <header className="border-border/70 bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur-xl lg:hidden">
                <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    aria-label={t("openMenu")}
                    className="text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground focus-visible:ring-ring grid size-9 place-items-center rounded-xl ring-1 transition-colors duration-200 ring-inset focus-visible:ring-2 focus-visible:outline-none"
                >
                    <IconMenu2 className="size-4.5" stroke={1.8} aria-hidden="true" />
                </button>
                <Link
                    href="/"
                    aria-label={t("home")}
                    className="focus-visible:ring-ring flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2"
                >
                    <ToolForgeMark className="size-7" />
                    <ToolForgeWordmark />
                </Link>
                <div className="ml-auto">
                    <ThemeToggle layoutIdPrefix="mobile" />
                </div>
            </header>

            <MobileNavDrawer open={mobileOpen} onOpenChange={setMobileOpen} tools={tools} />

            {/* -------------------------------------------------------- content */}
            <div className={cn("lg:pl-[calc(var(--sidebar-w)+1.5rem)]", SHELL_EASING)}>
                <main
                    id="main-content"
                    className="mx-auto w-full max-w-296 px-4 pt-6 pb-24 sm:px-6 lg:px-10 lg:pt-10"
                >
                    {children}
                </main>
            </div>
        </div>
    );
}

/** Fixed, non-interactive wash that keeps the page from reading as flat white. */
function ShellBackdrop() {
    return (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div className="absolute -top-40 -left-32 size-144 rounded-full bg-[radial-gradient(circle,var(--shell-glow-a),transparent_68%)] blur-3xl" />
            <div className="absolute -top-24 right-0 size-120 rounded-full bg-[radial-gradient(circle,var(--shell-glow-b),transparent_70%)] blur-3xl" />
        </div>
    );
}

type MobileNavDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tools: readonly LocalizedTool[];
};

function MobileNavDrawer({ open, onOpenChange, tools }: MobileNavDrawerProps) {
    const t = useTranslations("nav");
    const dragStart = useRef<{ x: number; y: number } | null>(null);
    const [dragOffset, setDragOffset] = useState(0);

    function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
        const touch = event.touches[0];
        dragStart.current = { x: touch.clientX, y: touch.clientY };
    }

    function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
        if (!dragStart.current) {
            return;
        }

        const touch = event.touches[0];
        const deltaX = touch.clientX - dragStart.current.x;
        const deltaY = touch.clientY - dragStart.current.y;

        // Only take over once the gesture is clearly horizontal and leftward,
        // so vertical scrolling inside the list keeps working.
        if (deltaX < 0 && Math.abs(deltaX) > Math.abs(deltaY)) {
            setDragOffset(deltaX);
        }
    }

    function handleTouchEnd() {
        if (dragOffset < -SWIPE_CLOSE_THRESHOLD) {
            onOpenChange(false);
        }

        dragStart.current = null;
        setDragOffset(0);
    }

    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                setDragOffset(0);
                onOpenChange(next);
            }}
        >
            <SheetContent
                side="left"
                showCloseButton={false}
                className="bg-sidebar w-76 border-r-0 p-0 sm:max-w-76"
            >
                <SheetTitle className="sr-only">{t("menuTitle")}</SheetTitle>
                <SheetDescription className="sr-only">{t("menuDescription")}</SheetDescription>

                <div
                    className="group/shell relative flex h-full flex-col"
                    data-collapsed={false}
                    style={{
                        transform: `translateX(${dragOffset}px)`,
                        transition:
                            dragOffset === 0
                                ? "transform 220ms cubic-bezier(0.32,0.72,0,1)"
                                : "none",
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                >
                    <div className="flex items-center gap-2 px-4 pt-4 pb-1">
                        <ToolForgeMark />
                        <ToolForgeWordmark />
                    </div>

                    <SidebarNav
                        tools={tools}
                        collapsed={false}
                        layoutIdPrefix="mobile"
                        onNavigate={() => onOpenChange(false)}
                    />

                    <div className="border-sidebar-border flex items-center justify-between gap-2 border-t px-4 py-3">
                        <ThemeToggle layoutIdPrefix="mobile-drawer" />
                        <LocaleSwitcher />
                    </div>

                    <span
                        aria-hidden="true"
                        className="bg-border/80 absolute inset-y-0 right-0 my-auto h-16 w-1 rounded-full"
                    />
                </div>
            </SheetContent>
        </Sheet>
    );
}
