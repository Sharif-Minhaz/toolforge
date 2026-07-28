"use client";

import { IconBrandGithub } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SITE_REPOSITORY } from "@/modules/seo/domain/site";

/**
 * Icon-only link out to the public repository. Icon-only in both rail states,
 * so the label lives on `aria-label` and in the tooltip rather than in text.
 */
export function RepoLink({ className }: { className?: string }) {
    const t = useTranslations("nav");
    const label = t("repository");

    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <a
                        href={SITE_REPOSITORY}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={label}
                        className={cn(
                            "text-muted-foreground ring-border/70 inline-flex size-7 items-center justify-center rounded-full ring-1 transition-colors duration-200 ring-inset",
                            "hover:bg-muted/70 hover:text-foreground",
                            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                            className,
                        )}
                    >
                        <IconBrandGithub className="size-3.5" stroke={1.9} aria-hidden="true" />
                    </a>
                }
            />
            <TooltipContent side="top" sideOffset={8}>
                {label}
            </TooltipContent>
        </Tooltip>
    );
}
