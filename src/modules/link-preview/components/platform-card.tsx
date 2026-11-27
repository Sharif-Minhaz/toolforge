"use client";

import {
    IconBrandDiscord,
    IconBrandFacebook,
    IconBrandGoogle,
    IconBrandLinkedin,
    IconBrandSlack,
    IconBrandTelegram,
    IconBrandWhatsapp,
    IconBrandX,
    IconExternalLink,
    IconPhotoOff,
    type Icon,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { PLATFORM_RULES, type PreviewPlatform } from "../domain/platforms";
import type { CardImage, CardText, PreviewCard } from "../types";

/**
 * One platform's card, drawn from what the analysis decided.
 *
 * **Each card in its platform's own skin.** The card sits on the surface it
 * appears on — Facebook's feed, a WhatsApp chat, a Discord channel — in that
 * platform's colours and its light or dark theme, following this site's. Where
 * the picture sits, at what crop, which fields appear and how many lines each
 * gets before it clamps all come from the analysis; the colours come from the
 * `--lp-*` tokens in `globals.css`. No logos and no copied chrome beyond the
 * card itself, and the platform's own inspector is linked under every card for
 * the last word.
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

/** The mark beside each card's name, in the platform's colour. */
const PLATFORM_MARKS: Readonly<Record<PreviewPlatform, { Icon: Icon; className: string }>> = {
    facebook: { Icon: IconBrandFacebook, className: "text-(--lp-brand-facebook)" },
    x: { Icon: IconBrandX, className: "text-(--lp-brand-x)" },
    linkedin: { Icon: IconBrandLinkedin, className: "text-(--lp-brand-linkedin)" },
    whatsapp: { Icon: IconBrandWhatsapp, className: "text-(--lp-brand-whatsapp)" },
    slack: { Icon: IconBrandSlack, className: "text-(--lp-brand-slack)" },
    discord: { Icon: IconBrandDiscord, className: "text-(--lp-brand-discord)" },
    telegram: { Icon: IconBrandTelegram, className: "text-(--lp-brand-telegram)" },
    google: { Icon: IconBrandGoogle, className: "text-(--lp-brand-google)" },
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
            <div className={cn("overflow-hidden bg-current/5", className)} style={style}>
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
                "flex flex-col items-center justify-center gap-1 bg-current/5 px-2 text-center opacity-80",
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

type Media = "top" | "bottom";

/**
 * The picture and the text in the arrangement a layout calls for: a
 * full-width picture above (feeds) or below (chat embeds) the text, or a
 * square thumbnail beside it. `thumbClassName` rounds the thumbnail the way
 * the platform does.
 */
function Arranged({
    card,
    media,
    thumbRight,
    textClassName,
    pictureClassName,
    thumbClassName,
    children,
}: {
    card: PreviewCard;
    media: Media;
    thumbRight: boolean;
    textClassName: string;
    pictureClassName?: string;
    thumbClassName?: string;
    children: ReactNode;
}) {
    const rules = PLATFORM_RULES[card.platform];
    const text = <div className={cn("flex min-w-0 flex-col", textClassName)}>{children}</div>;

    if (card.layout === "text" || card.layout === "none") {
        return text;
    }

    if (card.layout === "large") {
        const picture = (
            <Picture image={card.image} ratio={rules.largeRatio} className={pictureClassName} />
        );

        return (
            <div className="flex flex-col">
                {media === "top" && picture}
                {text}
                {media === "bottom" && picture}
            </div>
        );
    }

    return (
        <div className={cn("flex items-stretch", thumbRight && "flex-row-reverse")}>
            <div className="min-w-0 flex-1">{text}</div>
            <Picture
                image={card.image}
                ratio={1}
                className={cn("w-20 shrink-0 self-start", thumbClassName)}
            />
        </div>
    );
}

function Labels({ card }: { card: PreviewCard }) {
    if (card.labels.length === 0) {
        return null;
    }

    return (
        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[0.75rem]">
            {card.labels.map((entry) => (
                <div key={entry.label} className="min-w-0">
                    <dt className="truncate font-bold">{entry.label}</dt>
                    <dd className="truncate">{entry.data}</dd>
                </div>
            ))}
        </dl>
    );
}

function Facebook({ card }: { card: PreviewCard }) {
    const rules = PLATFORM_RULES[card.platform];

    return (
        <div className="bg-(--lp-fb-canvas) p-3">
            <div className="overflow-hidden rounded-lg bg-(--lp-fb-surface) shadow-[0_1px_2px_rgb(0_0_0/0.2)]">
                <Arranged
                    card={card}
                    media="top"
                    thumbRight={false}
                    textClassName="gap-0.5 border-t border-(--lp-fb-border) bg-(--lp-fb-meta) px-3 py-2.5"
                    thumbClassName="w-24"
                >
                    {card.host !== null && (
                        <p className="truncate text-[0.75rem] tracking-wide text-(--lp-fb-muted) uppercase">
                            {card.host}
                        </p>
                    )}
                    <Text
                        value={card.title}
                        lines={rules.titleLines}
                        className="text-[0.9375rem] leading-snug font-semibold text-(--lp-fb-title)"
                    />
                    <Text
                        value={card.description}
                        lines={rules.descriptionLines}
                        className="text-[0.8125rem] leading-snug text-(--lp-fb-muted)"
                    />
                </Arranged>
            </div>
        </div>
    );
}

function X({ card }: { card: PreviewCard }) {
    const rules = PLATFORM_RULES[card.platform];

    if (card.layout === "large") {
        // The large card carries the title over the picture and nothing else;
        // the host sits under the card, outside it.
        return (
            <div className="flex flex-col gap-1 bg-(--lp-x-canvas) p-3">
                <div className="relative overflow-hidden rounded-2xl border border-(--lp-x-border)">
                    <Picture image={card.image} ratio={rules.largeRatio} />
                    {card.title !== null && (
                        <p
                            className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-sm bg-(--lp-x-overlay) px-1.5 py-0.5 text-[0.8125rem] text-(--lp-x-overlay-fg)"
                            title={card.title.full}
                        >
                            {card.title.text}
                        </p>
                    )}
                </div>
                {card.host !== null && (
                    <p className="truncate text-[0.8125rem] text-(--lp-x-muted)">{card.host}</p>
                )}
            </div>
        );
    }

    return (
        <div className="bg-(--lp-x-canvas) p-3">
            <div className="overflow-hidden rounded-2xl border border-(--lp-x-border)">
                <Arranged
                    card={card}
                    media="top"
                    thumbRight={false}
                    textClassName="gap-0.5 justify-center px-3 py-2.5"
                    thumbClassName="w-24 self-stretch border-r border-(--lp-x-border)"
                >
                    {card.host !== null && (
                        <p className="truncate text-[0.8125rem] text-(--lp-x-muted)">{card.host}</p>
                    )}
                    <Text
                        value={card.title}
                        lines={rules.titleLines}
                        className="text-[0.8125rem] leading-snug text-(--lp-x-title)"
                    />
                    <Text
                        value={card.description}
                        lines={rules.descriptionLines}
                        className="text-[0.8125rem] leading-snug text-(--lp-x-muted)"
                    />
                </Arranged>
            </div>
        </div>
    );
}

function LinkedIn({ card }: { card: PreviewCard }) {
    const rules = PLATFORM_RULES[card.platform];

    return (
        <div className="bg-(--lp-li-canvas) p-3">
            <div className="overflow-hidden rounded-lg border border-(--lp-li-border) bg-(--lp-li-surface)">
                <Arranged
                    card={card}
                    media="top"
                    thumbRight={false}
                    textClassName="gap-0.5 bg-(--lp-li-meta) px-3 py-2"
                    thumbClassName="w-24"
                >
                    <Text
                        value={card.title}
                        lines={rules.titleLines}
                        className="text-[0.875rem] leading-snug font-semibold text-(--lp-li-title)"
                    />
                    {card.host !== null && (
                        <p className="truncate text-[0.75rem] text-(--lp-li-muted)">{card.host}</p>
                    )}
                </Arranged>
            </div>
        </div>
    );
}

function WhatsApp({ card }: { card: PreviewCard }) {
    const rules = PLATFORM_RULES[card.platform];

    return (
        <div className="flex justify-end bg-(--lp-wa-canvas) p-3">
            {/* An outgoing message: the bubble with the preview inside it and
                the link the sender typed underneath. */}
            <div className="w-[92%] rounded-lg rounded-tr-none bg-(--lp-wa-bubble) p-1 shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
                <div className="overflow-hidden rounded-md bg-(--lp-wa-meta)">
                    <Arranged
                        card={card}
                        media="top"
                        thumbRight={false}
                        textClassName="gap-0.5 px-2.5 py-2"
                        thumbClassName="w-20"
                    >
                        <Text
                            value={card.title}
                            lines={rules.titleLines}
                            className="text-[0.8125rem] leading-snug font-semibold text-(--lp-wa-title)"
                        />
                        <Text
                            value={card.description}
                            lines={rules.descriptionLines}
                            className="text-[0.75rem] leading-snug text-(--lp-wa-muted)"
                        />
                        {card.host !== null && (
                            <p className="truncate text-[0.75rem] text-(--lp-wa-muted)">
                                {card.host}
                            </p>
                        )}
                    </Arranged>
                </div>
                {card.host !== null && (
                    <p className="truncate px-1.5 pt-1 pb-0.5 text-[0.8125rem] text-(--lp-wa-link) underline">
                        {card.host}
                    </p>
                )}
            </div>
        </div>
    );
}

function Slack({ card }: { card: PreviewCard }) {
    const rules = PLATFORM_RULES[card.platform];
    const site = card.siteName ?? card.host;

    return (
        <div className="bg-(--lp-slack-canvas) p-3 text-(--lp-slack-text)">
            <div className="relative pl-3.5">
                <span
                    className="absolute inset-y-0 left-0 w-1 rounded-full bg-(--lp-slack-bar)"
                    aria-hidden="true"
                />
                <Arranged
                    card={card}
                    media="bottom"
                    thumbRight
                    textClassName="gap-0.5 pb-2"
                    pictureClassName="rounded-lg max-w-90"
                    thumbClassName="ml-3 w-18 rounded-md"
                >
                    {site !== null && <p className="truncate text-[0.8125rem] font-bold">{site}</p>}
                    <Text
                        value={card.title}
                        lines={rules.titleLines}
                        className="text-[0.875rem] leading-snug font-bold text-(--lp-slack-link)"
                    />
                    <Text
                        value={card.description}
                        lines={rules.descriptionLines}
                        className="text-[0.8125rem] leading-snug"
                    />
                    <Labels card={card} />
                </Arranged>
            </div>
        </div>
    );
}

function Discord({ card }: { card: PreviewCard }) {
    const rules = PLATFORM_RULES[card.platform];
    const site = card.siteName ?? card.host;
    // The page's own `theme-color`, drawn as Discord draws it. A colour from
    // data rather than a token, for the same reason a canvas paint colour over
    // a photograph is: it is the thing being previewed.
    const accent: CSSProperties | undefined =
        card.accent === null ? undefined : { borderLeftColor: card.accent };

    return (
        <div className="bg-(--lp-dc-canvas) p-3">
            <div
                className="max-w-108 rounded-[4px] border-l-4 border-(--lp-dc-bar) bg-(--lp-dc-embed) p-3 text-(--lp-dc-text)"
                style={accent}
            >
                <Arranged
                    card={card}
                    media="bottom"
                    thumbRight
                    textClassName="gap-1 pb-3"
                    pictureClassName="rounded-[4px]"
                    thumbClassName="ml-3 w-20 rounded-[4px]"
                >
                    {site !== null && (
                        <p className="truncate text-[0.75rem] text-(--lp-dc-muted)">{site}</p>
                    )}
                    <Text
                        value={card.title}
                        lines={rules.titleLines}
                        className="text-[0.9375rem] leading-snug font-semibold text-(--lp-dc-link)"
                    />
                    <Text
                        value={card.description}
                        lines={rules.descriptionLines}
                        className="text-[0.8125rem] leading-snug"
                    />
                </Arranged>
            </div>
        </div>
    );
}

function Telegram({ card }: { card: PreviewCard }) {
    const rules = PLATFORM_RULES[card.platform];
    const site = card.siteName ?? card.host;

    return (
        <div className="bg-(--lp-tg-canvas) p-3">
            {/* An incoming message: the link the sender typed, then the
                preview in its accent-tinted box. */}
            <div className="w-[92%] rounded-xl rounded-bl-sm bg-(--lp-tg-bubble) p-2 text-(--lp-tg-text) shadow-[0_1px_2px_rgb(16_35_47/0.15)]">
                {card.host !== null && (
                    <p className="truncate px-0.5 pb-1.5 text-[0.8125rem] text-(--lp-tg-accent)">
                        {card.host}
                    </p>
                )}
                <div className="relative overflow-hidden rounded-md bg-[color-mix(in_oklab,var(--lp-tg-accent)_10%,transparent)] py-1.5 pr-2 pl-3">
                    <span
                        className="absolute inset-y-0 left-0 w-[3px] bg-(--lp-tg-accent)"
                        aria-hidden="true"
                    />
                    <Arranged
                        card={card}
                        media="bottom"
                        thumbRight
                        textClassName="gap-0.5 pb-1.5"
                        pictureClassName="rounded-md"
                        thumbClassName="ml-2 w-16 rounded-md"
                    >
                        {site !== null && (
                            <p className="truncate text-[0.8125rem] font-semibold text-(--lp-tg-accent)">
                                {site}
                            </p>
                        )}
                        <Text
                            value={card.title}
                            lines={rules.titleLines}
                            className="text-[0.8125rem] leading-snug font-semibold"
                        />
                        <Text
                            value={card.description}
                            lines={rules.descriptionLines}
                            className="text-[0.8125rem] leading-snug"
                        />
                    </Arranged>
                </div>
            </div>
        </div>
    );
}

function Google({ card }: { card: PreviewCard }) {
    const rules = PLATFORM_RULES[card.platform];

    return (
        <div className="flex min-w-0 flex-col gap-1 bg-(--lp-g-canvas) p-4 font-(family-name:--lp-font-google)">
            <div className="flex min-w-0 items-center gap-2.5">
                {/* The favicon's place, left empty: drawing the real one would
                    have the reader's browser contact the inspected site. */}
                <span
                    className="size-7 shrink-0 rounded-full bg-(--lp-g-favicon)"
                    aria-hidden="true"
                />
                <div className="min-w-0">
                    <p className="truncate text-[0.875rem] text-(--lp-g-site)">
                        {card.siteName ?? card.host}
                    </p>
                    <p className="truncate text-[0.75rem] text-(--lp-g-url)">{card.host}</p>
                </div>
            </div>
            <Text
                value={card.title}
                lines={rules.titleLines}
                className="pt-1 text-[1.125rem] leading-snug text-(--lp-g-link)"
            />
            <Text
                value={card.description}
                lines={rules.descriptionLines}
                className="text-[0.8125rem] leading-normal text-(--lp-g-text)"
            />
        </div>
    );
}

function CardBody({ card }: { card: PreviewCard }) {
    switch (card.platform) {
        case "facebook":
            return <Facebook card={card} />;
        case "x":
            return <X card={card} />;
        case "linkedin":
            return <LinkedIn card={card} />;
        case "whatsapp":
            return <WhatsApp card={card} />;
        case "slack":
            return <Slack card={card} />;
        case "discord":
            return <Discord card={card} />;
        case "telegram":
            return <Telegram card={card} />;
        case "google":
            return <Google card={card} />;
    }
}

export function PlatformCard({ card, name }: PlatformCardProps) {
    const t = useTranslations("linkPreview.workbench");
    const tSources = useTranslations("linkPreview.sources");
    const rules = PLATFORM_RULES[card.platform];
    const mark = PLATFORM_MARKS[card.platform];

    return (
        <section aria-label={name} className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-[0.8125rem] font-semibold">
                    <mark.Icon
                        className={cn("size-4 shrink-0", mark.className)}
                        stroke={1.75}
                        aria-hidden="true"
                    />
                    {name}
                </h3>
                <span className="text-muted-foreground text-[0.6875rem]">
                    {t(`layouts.${card.layout}`)}
                </span>
            </div>

            {card.layout === "none" ? (
                <div className="bg-muted/40 text-muted-foreground ring-border/70 rounded-xl px-3 py-6 text-center text-[0.75rem] ring-1 ring-inset">
                    {t("noCard")}
                </div>
            ) : (
                // The stage: the platform's own surface, clipped to this
                // site's card radius so eight skins still read as one grid.
                <div className="ring-border/70 overflow-hidden rounded-xl font-(family-name:--lp-font) ring-1">
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
