"use client";

import { useTranslations } from "next-intl";

import type { PhotoFacts as Facts } from "../types";

const FACT_KEYS = [
    "camera",
    "lens",
    "takenAt",
    "exposure",
    "aperture",
    "iso",
    "focalLength",
    "software",
    "orientation",
] as const;

type FactKey = (typeof FACT_KEYS)[number];

function valueOf(facts: Facts, key: FactKey): string | null {
    if (key === "camera") {
        const camera = [facts.make, facts.model].filter((part) => part !== null).join(" ");

        return camera.length > 0 ? camera : null;
    }

    return facts[key];
}

/** The camera settings, as a compact grid of whichever the file has. */
export function PhotoFacts({ facts }: { facts: Facts }) {
    const t = useTranslations("photoExif.workbench");
    const rows = FACT_KEYS.flatMap((key) => {
        const value = valueOf(facts, key);

        return value === null ? [] : [{ key, value }];
    });

    if (rows.length === 0) {
        return null;
    }

    return (
        <section className="flex flex-col gap-1.5">
            <h3 className="text-muted-foreground text-xs leading-[1.3] font-medium">
                {t("factsLabel")}
            </h3>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((row) => (
                    <div key={row.key} className="flex min-w-0 flex-col gap-0.5">
                        <dt className="text-muted-foreground text-[0.6875rem] leading-[1.3]">
                            {t(`facts.${row.key}`)}
                        </dt>
                        <dd className="font-mono text-xs break-all">{row.value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
