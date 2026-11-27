"use client";

import { useTranslations } from "next-intl";

import type { HeadTag } from "../types";

/**
 * Every preview-relevant tag in the head, in the order the page wrote them.
 *
 * In order rather than grouped, because order is meaning here: an
 * `og:image:width` belongs to the `og:image` above it, and a duplicated key is
 * only visibly a duplicate when the two copies sit where the page put them.
 */

/** Keys a preview crawler reads; everything else in a head is noise for this table. */
function isPreviewTag(tag: HeadTag): boolean {
    if (tag.kind === "title") {
        return true;
    }

    if (tag.kind === "link") {
        return /\b(canonical|icon|apple-touch-icon|alternate)\b/.test(tag.key);
    }

    return (
        /^(og|twitter|fb|article|profile|book|music|video):/.test(tag.key) ||
        tag.key === "description" ||
        tag.key === "theme-color" ||
        tag.key === "robots"
    );
}

export function previewTagsOf(tags: readonly HeadTag[]): HeadTag[] {
    return tags.filter(isPreviewTag);
}

export function TagTable({ tags }: { tags: readonly HeadTag[] }) {
    const t = useTranslations("linkPreview.workbench");
    const rows = previewTagsOf(tags);

    if (rows.length === 0) {
        return <p className="text-muted-foreground text-[0.8125rem]">{t("tagsEmpty")}</p>;
    }

    return (
        <div className="ring-border/70 overflow-x-auto rounded-xl ring-1 ring-inset">
            <table className="w-full min-w-[32rem] text-left text-[0.75rem]">
                <caption className="sr-only">{t("tagsCaption")}</caption>
                <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                        <th scope="col" className="px-3 py-2 font-medium">
                            {t("colKey")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                            {t("colAttribute")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                            {t("colValue")}
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-border/70 divide-y">
                    {rows.map((tag, index) => (
                        <tr key={`${tag.key}-${index}`} className="align-top">
                            <td className="px-3 py-1.5 font-mono whitespace-nowrap">{tag.key}</td>
                            <td className="text-muted-foreground px-3 py-1.5 font-mono whitespace-nowrap">
                                {tag.kind === "meta"
                                    ? tag.attribute
                                    : tag.kind === "link"
                                      ? "rel"
                                      : "—"}
                            </td>
                            <td className="px-3 py-1.5 font-mono break-all">{tag.value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
