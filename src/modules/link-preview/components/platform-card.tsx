"use client";

import { IconExternalLink, IconPhotoOff } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { PLATFORM_RULES } from "../domain/platforms";
import type { CardImage, CardText, PreviewCard } from "../types";

/**
 * One platform's card, drawn from what the analysis decided.
 *
 * **Shapes, not replicas.** Each card keeps what decides whether a preview
 * works — where the picture sits and at what crop, which fields appear, how
 * many lines each gets before it clamps — and draws it in this site's own
 * tokens. No logos, no brand colours, no copied chrome: the reader is checking
 * their tags against a platform's rules, not admiring a screenshot of it, and
 * the platform's own inspector is linked under every card for the last word.
 *
 * Clamping is CSS `line-clamp`, by rendered width, which is how the platforms
 * actually cut; the character and byte limits some of them publish are checked
 * separately and reported as findings.
 */

type PlatformCardProps = {
    card: PreviewCard;
    /** Translated platform name. */
    name: string;
};

const CLAMP: Readonly<Record<number, string>> = {
    1: "line-clamp-1",
    2: "line-clamp-2",
    3: "line-clamp-3",
    20: "line-clamp-[20]",
};

function clampClass(lines: number): string {
    return CLAMP[lines] ?? "line-clamp-3";
}

function Picture({
    image,
    ratio,
    className,
}: {
    image: CardImage | null;
    ratio: number;
    className?: string;
}) {
    const t = useTranslations("linkPreview.workbench");
    const probe = image?.probe ?? null;
    const style: CSSProperties = { aspectRatio: String(ratio) };

    if (probe !== null && probe.ok) {
        return (
            <div className={cn("bg-muted overflow-hidden", className)} style={style}>
                {/* A plain `<img>`, deliberately: the source is a data URL the
                    server fetched, which `next/image` has nothing to optimise,
                    and the reader's browser never contacts the inspected site. */}
                <img
                    src={probe.dataUrl}
                    alt={t("imageAlt")}
                    className="size-full object-cover"
                    draggable={false}
                />
            </div>
        );
    }

    return (
        <div
            className={cn(
                "bg-muted/70 text-muted-foreground flex flex-col items-center justify-center gap-1 px-2 text-center",
                className,
            )}
            style={style}
        >
            <IconPhotoOff className="size-5" stroke={1.6} aria-hidden="true" />
            <span className="text-[0.625rem] leading-tight">
                {image === null ? t("noImage") : t("imageNotMeasured")}
            </span>
        </div>
    );
}

function Text({
    value,
    lines,
    className,
}: {
    value: CardText | null;
    lines: number;
    className?: string;
}) {
    if (value === null || lines === 0) {
        return null;
    }

    return (
        // `title` carries the whole of a clipped value, so nothing the page
        // wrote is only reachable by reading the source.
        <p className={cn(clampClass(lines), "break-words", className)} title={value.full}>
            {value.text}
        </p>
    );
}

/** Text beside a square thumbnail, or above or below a full-width picture. */
function Split({
    card,
    large,
    thumbRight,
    children,
}: {
    card: PreviewCard;
    large: boolean;
    thumbRight: boolean;
    children: ReactNode;
}) {
    const rules = PLATFORM_RULES[card.platform];

    if (card.layout === "text" || card.layout === "none") {
        return <div className="flex min-w-0 flex-col gap-1 p-3">{children}</div>;
    }

    if (large) {
        return (
            <div className="flex flex-col">
                <Picture image={card.image} ratio={rules.largeRatio} />
                <div className="flex min-w-0 flex-col gap-1 p-3">{children}</div>
            </div>
        );
    }

    return (
        <div className={cn("flex items-stretch gap-3 p-3", thumbRight && "flex-row-reverse")}>
            <Picture image={card.image} ratio={1} className="w-20 shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
        </div>
    );
}

function HostLine({ card, upper = false }: { card: PreviewCard; upper?: boolean }) {
    if (card.host === null) {
        return null;
    }

    return (
        <p
            className={cn(
                "text-muted-foreground truncate text-[0.6875rem]",
                upper && "tracking-wide uppercase",
            )}
        >
            {card.host}
        </p>
    );
}

function SiteName({ card }: { card: PreviewCard }) {
    const label = card.siteName ?? card.host;

    return label === null ? null : (
        <p className="text-muted-foreground truncate text-[0.6875rem] font-medium">{label}</p>
    );
}

function Labels({ card }: { card: PreviewCard }) {
    if (card.labels.length === 0) {
        return null;
    }

    return (
        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[0.6875rem]">
            {card.labels.map((entry) => (
                <div key={entry.label} className="min-w-0">
                    <dt className="text-muted-foreground truncate font-medium">{entry.label}</dt>
                    <dd className="truncate">{entry.data}</dd>
                </div>
            ))}
        </dl>
    );
}

function CardBody({ card }: { card: PreviewCard }) {
    const rules = PLATFORM_RULES[card.platform];
    const large = card.layout === "large";
    const title = (className: string) => (
        <Text value={card.title} lines={rules.titleLines} className={className} />
    );
    const description = (
        <Text
            value={card.description}
            lines={rules.descriptionLines}
            className="text-muted-foreground text-[0.75rem] leading-snug"
        />
    );

    switch (card.platform) {
        case "facebook":
            return (
                <Split card={card} large={large} thumbRight={false}>
                    <HostLine card={card} upper />
                    {title("text-[0.875rem] leading-snug font-semibold")}
                    {description}
                </Split>
            );
        case "linkedin":
            return (
                <Split card={card} large={large} thumbRight={false}>
                    {title("text-[0.875rem] leading-snug font-semibold")}
                    <HostLine card={card} />
                </Split>
            );
        case "x":
            // The large card carries the title over the picture and nothing
            // else; the small one keeps title and description beside a square.
            if (large) {
                return (
                    <div className="relative">
                        <Picture image={card.image} ratio={rules.largeRatio} />
                        {card.title !== null && (
                            <p
                                className="bg-background/85 text-foreground absolute bottom-2 left-2 max-w-[85%] truncate rounded-md px-2 py-0.5 text-[0.75rem]"
                                title={card.title.full}
                            >
                                {card.title.text}
                            </p>
                        )}
                        <p className="text-muted-foreground px-3 py-2 text-[0.6875rem]">
                            {card.host}
                        </p>
                    </div>
                );
            }

            return (
                <Split card={card} large={false} thumbRight={false}>
                    <HostLine card={card} />
                    {title("text-[0.8125rem] leading-snug")}
                    {description}
                </Split>
            );
        case "whatsapp":
            return (
                <Split card={card} large={large} thumbRight={false}>
                    {title("text-[0.8125rem] leading-snug font-semibold")}
                    {description}
                    <HostLine card={card} />
                </Split>
            );
        case "slack":
        case "discord":
        case "telegram":
            return (
                <Split card={card} large={large} thumbRight>
                    <SiteName card={card} />
                    {title("text-primary text-[0.8125rem] leading-snug font-semibold")}
                    {description}
                    {card.platform === "slack" && <Labels card={card} />}
                </Split>
            );
        case "google":
            return (
                <div className="flex min-w-0 flex-col gap-1 p-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <span
                            className="bg-muted ring-border flex size-6 shrink-0 items-center justify-center rounded-full ring-1"
                            aria-hidden="true"
                        />
                        <div className="min-w-0">
                            <p className="truncate text-[0.75rem]">{card.siteName ?? card.host}</p>
                            <p className="text-muted-foreground truncate text-[0.6875rem]">
                                {card.host}
                            </p>
                        </div>
                    </div>
                    {title("text-primary text-[0.9375rem] leading-snug")}
                    {description}
                </div>
            );
    }
}

/** The bar down a card's left edge: Discord's theme colour, the others' neutral rule. */
function edgeFor(card: PreviewCard): { className: string; style?: CSSProperties } {
    if (card.platform === "discord" && card.accent !== null) {
        // The page's own `theme-color`, drawn as Discord draws it. A colour
        // from data rather than a token, for the same reason a canvas paint
        // colour over a photograph is: it is the thing being previewed.
        return { className: "border-l-4", style: { borderLeftColor: card.accent } };
    }

    if (card.platform === "slack" || card.platform === "discord" || card.platform === "telegram") {
        return { className: "border-l-4 border-l-border" };
    }

    return { className: "" };
}

export function PlatformCard({ card, name }: PlatformCardProps) {
    const t = useTranslations("linkPreview.workbench");
    const tSources = useTranslations("linkPreview.sources");
    const rules = PLATFORM_RULES[card.platform];
    const edge = edgeFor(card);

    return (
        <section aria-label={name} className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[0.8125rem] font-semibold">{name}</h3>
                <span className="text-muted-foreground text-[0.6875rem]">
                    {t(`layouts.${card.layout}`)}
                </span>
            </div>

            {card.layout === "none" ? (
                <div className="bg-muted/40 text-muted-foreground ring-border/70 rounded-xl px-3 py-6 text-center text-[0.75rem] ring-1 ring-inset">
                    {t("noCard")}
                </div>
            ) : (
                <div
                    className={cn(
                        "bg-card ring-border/70 overflow-hidden rounded-xl ring-1 ring-inset",
                        edge.className,
                    )}
                    style={edge.style}
                >
                    <CardBody card={card} />
                </div>
            )}

            <ul className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem]">
                {card.title !== null && (
                    <li>
                        {t("fieldFrom", {
                            field: t("fieldTitle"),
                            source: tSources(card.title.source),
                        })}
                    </li>
                )}
                {card.image !== null && (
                    <li>
                        {t("fieldFrom", {
                            field: t("fieldImage"),
                            source: tSources(card.image.source),
                        })}
                    </li>
                )}
                {rules.layoutProvenance === "reported" && <li>{t("layoutReported")}</li>}
            </ul>

            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem]">
                <a
                    href={rules.reference}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                    {t("rulesLink")}
                    <IconExternalLink className="size-3" stroke={1.8} aria-hidden="true" />
                </a>
                {rules.debugger !== null && (
                    <a
                        href={rules.debugger}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    >
                        {t("debuggerLink", { platform: name })}
                        <IconExternalLink className="size-3" stroke={1.8} aria-hidden="true" />
                    </a>
                )}
            </div>
        </section>
    );
}
