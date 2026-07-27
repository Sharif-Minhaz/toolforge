"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import {
    Select,
    SelectContent,
    SelectGroup,
    SelectLabel,
    SelectItem,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ALGORITHM_LABELS } from "../domain/algorithms";
import { ARGON2_VARIANTS, DIGEST_ALGORITHMS, HASH_ALGORITHMS, type HashAlgorithm } from "../types";

const ALGORITHM_ITEMS: Record<string, ReactNode> = Object.fromEntries(
    HASH_ALGORITHMS.map((algorithm) => [algorithm, ALGORITHM_LABELS[algorithm]]),
);

const PASSWORD_ALGORITHMS: readonly HashAlgorithm[] = ["bcrypt", ...ARGON2_VARIANTS];

type AlgorithmSelectProps = {
    value: HashAlgorithm;
    onChange: (algorithm: HashAlgorithm) => void;
    labelledBy: string;
    className?: string;
};

/**
 * Grouped by family rather than listed flat: the split between a fast digest
 * and a password hash is the one choice on this page that actually matters, so
 * the menu makes it structural instead of leaving it to be inferred.
 */
export function AlgorithmSelect({ value, onChange, labelledBy, className }: AlgorithmSelectProps) {
    const t = useTranslations("hash.workbench.groups");

    return (
        <Select
            items={ALGORITHM_ITEMS}
            value={value}
            onValueChange={(next) => {
                if (next !== null) {
                    onChange(next);
                }
            }}
        >
            <SelectTrigger aria-labelledby={labelledBy} className={className}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
                <SelectGroup>
                    <SelectLabel>{t("digest")}</SelectLabel>
                    {DIGEST_ALGORITHMS.map((algorithm) => (
                        <SelectItem key={algorithm} value={algorithm}>
                            {ALGORITHM_LABELS[algorithm]}
                        </SelectItem>
                    ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                    <SelectLabel>{t("password")}</SelectLabel>
                    {PASSWORD_ALGORITHMS.map((algorithm) => (
                        <SelectItem key={algorithm} value={algorithm}>
                            {ALGORITHM_LABELS[algorithm]}
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}
