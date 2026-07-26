import type { ReactNode } from "react";

type SectionHeadingProps = {
    title: string;
    description: string;
    action?: ReactNode;
};

export function SectionHeading({ title, description, action }: SectionHeadingProps) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
                <p className="text-muted-foreground text-sm">{description}</p>
            </div>
            {action}
        </div>
    );
}
