import type { AimPoint } from "../types";

/** Plot half-width in offset units: the rim sits at 1, and a little room past it. */
const EXTENT = 1.15;

type GroupingPlotProps = {
    /** Hit offsets as fractions of the radius. */
    offsets: readonly AimPoint[];
    bias: AimPoint | null;
    label: string;
    emptyLabel: string;
    /** The plot in words, which is what a screen reader is given instead. */
    description: string;
};

/**
 * Every hit laid over one target, the way a shooter reads a paper target: a
 * tight group off to one side is a hand that pulls, a wide group round the
 * centre is a hand that is not yet steady. The ring marks the group's mean.
 */
export function GroupingPlot({ offsets, bias, label, emptyLabel, description }: GroupingPlotProps) {
    return (
        <figure className="ring-border/60 flex min-w-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-inset">
            <figcaption className="text-muted-foreground text-xs font-medium">{label}</figcaption>
            {offsets.length === 0 ? (
                <p className="text-muted-foreground grid aspect-square place-items-center text-center text-[0.75rem]">
                    {emptyLabel}
                </p>
            ) : (
                <svg
                    viewBox={`${-EXTENT} ${-EXTENT} ${EXTENT * 2} ${EXTENT * 2}`}
                    className="text-primary aspect-square w-full"
                    role="img"
                    aria-label={description}
                >
                    <circle
                        r={1}
                        className="fill-primary/8 stroke-primary/60"
                        strokeWidth={0.015}
                    />
                    <circle
                        r={0.55}
                        className="fill-primary/10 stroke-primary/30"
                        strokeWidth={0.01}
                    />
                    <line
                        x1={-1}
                        x2={1}
                        y1={0}
                        y2={0}
                        className="stroke-border"
                        strokeWidth={0.01}
                    />
                    <line
                        x1={0}
                        x2={0}
                        y1={-1}
                        y2={1}
                        className="stroke-border"
                        strokeWidth={0.01}
                    />
                    {offsets.map((offset, index) => (
                        <circle
                            key={index}
                            cx={offset.x}
                            cy={offset.y}
                            r={0.035}
                            className="fill-foreground/70"
                        />
                    ))}
                    {bias !== null && (
                        <circle
                            cx={bias.x}
                            cy={bias.y}
                            r={0.09}
                            fill="none"
                            className="stroke-primary"
                            strokeWidth={0.025}
                        />
                    )}
                </svg>
            )}
            <p className="text-muted-foreground text-[0.75rem] leading-5">{description}</p>
        </figure>
    );
}
