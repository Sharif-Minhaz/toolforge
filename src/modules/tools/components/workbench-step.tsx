import { IconAdjustmentsHorizontal, IconChevronDown } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export { StepLabel } from "./step-label";

/**
 * The surface a workbench's result sits on — one raised tray, so the end of a
 * tool reads as a place rather than as the next field down. The field inside
 * it takes `bg-card` to stay distinct from the tray.
 */
export const RESULT_TRAY =
    "bg-muted/40 ring-border flex min-w-0 flex-col gap-3 rounded-xl p-3 ring-1 ring-inset sm:p-4";

/**
 * Settings a reader rarely needs, folded away so the input and the result are
 * the first things on screen. A native `<details>`: keyboard and screen-reader
 * behaviour come from the platform, and nothing differs between server and
 * client render. `defaultOpen` unfolds it on arrival — for a link that already
 * fills one of the settings inside, which a folded box would hide.
 */
export function OptionsDisclosure({
    label,
    defaultOpen = false,
    children,
}: {
    label?: string;
    defaultOpen?: boolean;
    children: ReactNode;
}) {
    const t = useTranslations("common");

    return (
        <details className="group/options" open={defaultOpen}>
            <summary className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium transition-colors duration-150 [&::-webkit-details-marker]:hidden">
                <IconAdjustmentsHorizontal className="size-4" stroke={1.75} aria-hidden="true" />
                {label ?? t("options")}
                <IconChevronDown
                    className="size-4 transition-transform duration-150 group-open/options:rotate-180"
                    stroke={1.75}
                    aria-hidden="true"
                />
            </summary>
            <div className="pt-4">{children}</div>
        </details>
    );
}
