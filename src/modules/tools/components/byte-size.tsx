"use client";

import { useFormatter, useTranslations } from "next-intl";

import { describeByteSize } from "../domain/byte-size";

/**
 * Formats a byte count for the active locale — Bengali numerals included —
 * while the unit itself comes from the message catalogue.
 */
export function useByteLabel(): (bytes: number) => string {
    const t = useTranslations("units");
    const format = useFormatter();

    return (bytes: number) => {
        const { value, unit } = describeByteSize(bytes);

        return t(unit, { value: format.number(value) });
    };
}

type ByteSizeProps = {
    bytes: number;
    className?: string;
};

export function ByteSize({ bytes, className }: ByteSizeProps) {
    const label = useByteLabel();

    return <span className={className}>{label(bytes)}</span>;
}
