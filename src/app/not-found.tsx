import { IconArrowLeft } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function NotFound() {
    const t = await getTranslations("notFound");

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
            <p className="text-primary font-mono text-sm font-medium tabular-nums">404</p>
            <h1 className="max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("title")}
            </h1>
            <p className="text-muted-foreground max-w-md text-[0.9375rem] leading-7">
                {t("description")}
            </p>
            <Link href="/" className={cn(buttonVariants(), "h-10 px-4")}>
                <IconArrowLeft className="size-4" stroke={1.9} aria-hidden="true" />
                {t("cta")}
            </Link>
        </div>
    );
}
