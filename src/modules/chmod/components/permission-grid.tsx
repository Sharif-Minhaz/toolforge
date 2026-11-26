"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { classDigit, permissionMask, specialMask } from "../domain/mode";
import { PERMISSION_CLASSES, PERMISSIONS, SPECIAL_BITS } from "../types";

const CHECKBOX =
    "accent-primary focus-visible:ring-ring size-4 shrink-0 cursor-pointer rounded focus-visible:ring-2 focus-visible:outline-none";

const CLASS_LETTER = { owner: "u", group: "g", others: "o" } as const;

const PERMISSION_WEIGHT = { read: 4, write: 2, execute: 1 } as const;

type PermissionGridProps = {
    mode: number;
    /** Flips the bits in `mask`; the grid never computes a mode itself. */
    onToggle: (mask: number) => void;
};

/**
 * The 3×3 grid and the special bits beneath it — the third view of the mode,
 * beside the octal and symbolic fields. Native checkboxes in a real table, so
 * each box is announced with its row and column.
 */
export function PermissionGrid({ mode, onToggle }: PermissionGridProps) {
    const t = useTranslations("chmod.workbench");
    const tClasses = useTranslations("chmod.classes");
    const tPermissions = useTranslations("chmod.permissions");
    const tSpecial = useTranslations("chmod.special");

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-x-auto">
                <table className="w-full min-w-72 border-separate border-spacing-y-1 text-sm">
                    <thead>
                        <tr className="text-muted-foreground text-xs">
                            <th scope="col" className="text-left font-medium">
                                <span className="sr-only">{t("classHeader")}</span>
                            </th>
                            {PERMISSIONS.map((permission) => (
                                <th key={permission} scope="col" className="px-2 font-medium">
                                    <span className="flex flex-col items-center gap-0.5 leading-[1.3]">
                                        {tPermissions(permission)}
                                        <span className="font-mono text-[0.6875rem]">
                                            {PERMISSION_WEIGHT[permission]}
                                        </span>
                                    </span>
                                </th>
                            ))}
                            <th scope="col" className="px-2 text-right font-medium">
                                {t("digitHeader")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {PERMISSION_CLASSES.map((permissionClass) => (
                            <tr key={permissionClass}>
                                <th
                                    scope="row"
                                    className="bg-card rounded-l-lg py-2 pl-3 text-left font-medium"
                                >
                                    <span className="leading-[1.3]">
                                        {tClasses(permissionClass)}
                                    </span>{" "}
                                    <span className="text-muted-foreground font-mono text-xs">
                                        {CLASS_LETTER[permissionClass]}
                                    </span>
                                </th>
                                {PERMISSIONS.map((permission) => {
                                    const mask = permissionMask(permissionClass, permission);

                                    return (
                                        <td
                                            key={permission}
                                            className="bg-card px-2 py-2 text-center"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={(mode & mask) !== 0}
                                                onChange={() => onToggle(mask)}
                                                aria-label={t("cellLabel", {
                                                    who: tClasses(permissionClass),
                                                    permission: tPermissions(permission),
                                                })}
                                                className={CHECKBOX}
                                            />
                                        </td>
                                    );
                                })}
                                <td className="bg-card rounded-r-lg py-2 pr-3 text-right font-mono text-base tabular-nums">
                                    {classDigit(mode, permissionClass)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <fieldset className="flex flex-col gap-2">
                <legend className="text-muted-foreground mb-2 text-xs font-medium">
                    {t("specialLabel")}
                </legend>
                <div className="grid gap-2 sm:grid-cols-3">
                    {SPECIAL_BITS.map((bit) => {
                        const mask = specialMask(bit);
                        const checked = (mode & mask) !== 0;

                        return (
                            <label
                                key={bit}
                                className={cn(
                                    "ring-border/70 flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 ring-1 ring-inset",
                                    checked ? "bg-primary/6 ring-primary/30" : "bg-card/60",
                                )}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggle(mask)}
                                    className={cn(CHECKBOX, "mt-0.5")}
                                />
                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="text-[0.8125rem] leading-[1.3] font-medium">
                                        {tSpecial(`${bit}.label`)}{" "}
                                        <span className="text-muted-foreground font-mono text-xs">
                                            {mask.toString(8)}
                                        </span>
                                    </span>
                                    <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                        {tSpecial(`${bit}.hint`)}
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>
        </div>
    );
}
