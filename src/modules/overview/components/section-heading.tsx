import type { ReactNode } from "react";

type SectionHeadingProps = {
    title: ReactNode;
    description: string;
    action?: ReactNode;
    /** The first section under the hero: larger, no bar; its title carries the accent word. */
    lead?: boolean;
};

export function SectionHeading({ title, description, action, lead = false }: SectionHeadingProps) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1.5">
                {lead ? (
                    <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
                ) : (
                    <h2 className="flex items-center gap-3 text-xl font-semibold tracking-tight sm:text-2xl">
                        <span
                            aria-hidden="true"
                            className="bg-primary h-6 w-1 shrink-0 rounded-full"
                        />
                        {title}
                    </h2>
                )}
                <p className="text-muted-foreground text-sm sm:text-[0.9375rem]">{description}</p>
            </div>
            {action}
        </div>
    );
}
