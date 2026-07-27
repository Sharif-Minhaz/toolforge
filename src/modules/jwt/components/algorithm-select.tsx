"use client";

import type { ReactNode } from "react";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { JWT_ALGORITHMS, type JwtAlgorithm } from "../types";

/**
 * JOSE identifiers are data, not copy — `ES256` reads the same in every locale,
 * so the list never enters the message catalogue.
 */
const ALGORITHM_ITEMS: Record<string, ReactNode> = Object.fromEntries(
    JWT_ALGORITHMS.map((algorithm) => [algorithm, algorithm]),
);

type AlgorithmSelectProps = {
    value: JwtAlgorithm;
    onChange: (algorithm: JwtAlgorithm) => void;
    labelledBy: string;
    className?: string;
};

export function AlgorithmSelect({ value, onChange, labelledBy, className }: AlgorithmSelectProps) {
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
                {JWT_ALGORITHMS.map((algorithm) => (
                    <SelectItem key={algorithm} value={algorithm}>
                        {algorithm}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
