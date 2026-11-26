"use client";

import { useTranslations } from "next-intl";

import { useByteLabel } from "@/modules/tools/components/byte-size";
import type { TagGroup } from "../types";

/**
 * Every tag, grouped by where it lives in the file. Keys are the standard tag
 * names — `DateTimeOriginal`, `GPSLatitude` — kept untranslated, because they
 * are what a reader searches the web for.
 */
export function TagTable({ groups }: { groups: readonly TagGroup[] }) {
    const t = useTranslations("photoExif.workbench");
    const byteLabel = useByteLabel();

    return (
        <div className="flex flex-col gap-4">
            {groups.map((group) => (
                <section key={group.id} className="flex min-w-0 flex-col gap-1.5">
                    <h4 className="text-muted-foreground text-xs leading-[1.3] font-medium">
                        {t(`groups.${group.id}`)}
                    </h4>
                    <div className="ring-border/70 overflow-x-auto rounded-lg ring-1 ring-inset">
                        <table className="w-full text-left text-xs">
                            <tbody>
                                {group.tags.map((tag, index) => (
                                    <tr
                                        key={`${tag.key}-${index}`}
                                        className="border-border/60 not-last:border-b"
                                    >
                                        <th
                                            scope="row"
                                            className="text-muted-foreground w-1/3 px-3 py-1.5 align-top font-mono font-normal break-all"
                                        >
                                            {tag.key}
                                        </th>
                                        <td className="px-3 py-1.5 align-top font-mono break-all">
                                            {tag.value.kind === "text"
                                                ? tag.value.text
                                                : t("bytesValue", {
                                                      size: byteLabel(tag.value.length),
                                                  })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ))}
        </div>
    );
}
