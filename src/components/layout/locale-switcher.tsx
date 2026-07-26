"use client";

import { IconLanguage } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALE_DESCRIPTORS, LOCALES, type Locale } from "@/i18n/config";
import { setLocale } from "@/modules/preferences/actions/set-locale";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ className }: { className?: string }) {
    const t = useTranslations("locale");
    const activeLocale = useLocale();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    function handleChange(value: string) {
        startTransition(async () => {
            const result = await setLocale(value);

            if (result.ok) {
                // Server components re-render with the new cookie in place.
                router.refresh();
            }
        });
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label={t("change")}
                disabled={isPending}
                className={cn(
                    "text-muted-foreground inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
                    "ring-border/70 ring-1 transition-colors duration-200 ring-inset",
                    "hover:bg-muted/70 hover:text-foreground",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    "disabled:pointer-events-none disabled:opacity-60",
                    className,
                )}
            >
                <IconLanguage className="size-3.5 shrink-0" stroke={1.9} aria-hidden="true" />
                <span className="group-data-[collapsed=true]/shell:hidden">
                    {LOCALE_DESCRIPTORS[activeLocale as Locale].nativeName}
                </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="min-w-40">
                <DropdownMenuRadioGroup value={activeLocale} onValueChange={handleChange}>
                    {LOCALES.map((locale) => (
                        <DropdownMenuRadioItem key={locale} value={locale}>
                            {LOCALE_DESCRIPTORS[locale].nativeName}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
