"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import type { DerivedRoute, HttpMethod, ResourceSummary } from "../types";

type RouteTableProps = {
    routes: readonly DerivedRoute[];
    resources: readonly ResourceSummary[];
    /** Writes are refused at the ceiling, so the rows that write are dimmed. */
    writesLocked: boolean;
};

/**
 * Every address this server answers on, derived from the document.
 *
 * Both this and the matcher read `deriveRoutes`, which is the property that
 * matters: a route printed here cannot 404. See `domain/routes.ts`.
 *
 * Two things it has to say that a plain list would not. A resource whose key
 * cannot appear in a URL — `a/b`, `first name` — publishes no routes, and
 * saying nothing about it would read as data that vanished; it gets a line of
 * its own naming what happened. And when the document is at its ceiling, the
 * rows that write are dimmed and labelled, because "why does POST 507" is
 * exactly the question this table exists to pre-empt.
 */
const METHOD_TONE: Record<HttpMethod, string> = {
    GET: "text-brand-emerald border-brand-emerald/35 bg-brand-emerald/8",
    HEAD: "text-brand-emerald border-brand-emerald/35 bg-brand-emerald/8",
    OPTIONS: "text-muted-foreground border-border/70 bg-muted/40",
    POST: "text-brand-cyan border-brand-cyan/35 bg-brand-cyan/8",
    PUT: "text-brand-amber border-brand-amber/35 bg-brand-amber/8",
    PATCH: "text-brand-violet border-brand-violet/35 bg-brand-violet/8",
    DELETE: "text-brand-rose border-brand-rose/35 bg-brand-rose/8",
};

export function RouteTable({ routes, resources, writesLocked }: RouteTableProps) {
    const t = useTranslations("jsonServer.routes");
    const unroutable = resources.filter((resource) => !resource.routable);

    if (routes.length === 0) {
        return (
            <p className="border-border/70 text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-xs leading-relaxed">
                {t("empty")}
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {/* Wide content scrolls inside its own container; the body never does. */}
            <div className="border-border/70 overflow-x-auto rounded-2xl border">
                <table className="w-full min-w-104 text-left text-xs">
                    <thead className="text-muted-foreground bg-muted/40">
                        <tr>
                            <th scope="col" className="px-3 py-2 font-medium">
                                {t("method")}
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                                {t("path")}
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                                {t("does")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {routes.map((route) => {
                            const locked = writesLocked && route.writes;

                            return (
                                <tr
                                    key={`${route.method} ${route.pattern}`}
                                    className={cn(
                                        "border-border/70 not-last:border-b",
                                        locked && "opacity-55",
                                    )}
                                >
                                    <td className="px-3 py-2 align-top">
                                        <span
                                            className={cn(
                                                "inline-flex rounded-lg border px-1.5 py-0.5 font-mono text-[0.625rem] leading-[1.3] font-semibold",
                                                METHOD_TONE[route.method],
                                            )}
                                        >
                                            {route.method}
                                        </span>
                                    </td>
                                    <td className="text-foreground px-3 py-2 align-top font-mono">
                                        {route.pattern}
                                    </td>
                                    <td className="text-muted-foreground px-3 py-2 align-top">
                                        {locked
                                            ? t("lockedRow")
                                            : t(`verb.${describe(route)}`, {
                                                  resource: route.resource,
                                              })}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {unroutable.length > 0 ? (
                <p className="text-brand-amber flex items-start gap-1.5 text-[0.6875rem] leading-normal">
                    <IconAlertTriangle
                        className="mt-px size-3.5 shrink-0"
                        stroke={2}
                        aria-hidden="true"
                    />
                    {t("unroutable", {
                        names: unroutable.map((resource) => resource.name).join(", "),
                        count: unroutable.length,
                    })}
                </p>
            ) : null}
        </div>
    );
}

/**
 * Which sentence describes this route.
 *
 * A literal union rather than a built string, because it becomes a message key
 * and `next-intl` only type-checks those built from unions. See CLAUDE.md.
 *
 * The resource's *kind* is what disambiguates `GET /posts` from `GET /profile`:
 * both are one segment with no `:id`, and one lists while the other reads a
 * single object. That is why `DerivedRoute` carries it.
 */
type RouteVerb =
    | "list"
    | "create"
    | "read"
    | "replace"
    | "merge"
    | "remove"
    | "readOne"
    | "replaceOne"
    | "mergeOne";

function describe(route: DerivedRoute): RouteVerb {
    const byId = route.pattern.endsWith("/:id");

    switch (route.method) {
        case "POST":
            return "create";
        case "DELETE":
            return "remove";
        case "PUT":
            return byId ? "replace" : "replaceOne";
        case "PATCH":
            return byId ? "merge" : "mergeOne";
        default:
            return byId ? "read" : route.kind === "collection" ? "list" : "readOne";
    }
}
