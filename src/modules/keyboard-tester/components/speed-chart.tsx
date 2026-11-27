import { useFormatter } from "next-intl";

const WIDTH = 600;
const HEIGHT = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };

type SpeedChartProps = {
    /** Words per minute at the end of each second. */
    values: readonly number[];
    label: string;
    emptyLabel: string;
};

/**
 * Speed over the run, one point a second. A plain line on a hairline grid:
 * the shape — a fast start that sags, a slow start that builds — is the
 * reading, and the exact figures are in the tiles beside it.
 *
 * The figure is described in words for a screen reader through `aria-label`;
 * the SVG itself is decorative.
 */
export function SpeedChart({ values, label, emptyLabel }: SpeedChartProps) {
    const formatter = useFormatter();

    if (values.length < 2) {
        return (
            <div className="ring-border/60 text-muted-foreground grid min-h-40 place-items-center rounded-xl p-4 text-center text-[0.75rem] ring-1 ring-inset">
                {emptyLabel}
            </div>
        );
    }

    const peak = Math.max(...values);
    // Round the scale up to a tidy step so the grid lines land on round numbers.
    const step = peak <= 40 ? 10 : peak <= 100 ? 20 : 40;
    const top = Math.max(step, Math.ceil(peak / step) * step);
    const innerWidth = WIDTH - PAD.left - PAD.right;
    const innerHeight = HEIGHT - PAD.top - PAD.bottom;
    const x = (index: number) => PAD.left + (index / (values.length - 1)) * innerWidth;
    const y = (value: number) => PAD.top + innerHeight - (value / top) * innerHeight;
    const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
    const area = `${PAD.left},${PAD.top + innerHeight} ${points} ${x(values.length - 1)},${PAD.top + innerHeight}`;
    const grid = Array.from({ length: top / step + 1 }, (_, index) => index * step);

    return (
        <figure className="ring-border/60 flex min-w-0 flex-col gap-1 rounded-xl p-3 ring-1 ring-inset">
            <figcaption className="text-muted-foreground text-xs font-medium">{label}</figcaption>
            <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="text-primary h-auto w-full"
                role="img"
                aria-label={label}
            >
                {grid.map((value) => (
                    <g key={value}>
                        <line
                            x1={PAD.left}
                            x2={WIDTH - PAD.right}
                            y1={y(value)}
                            y2={y(value)}
                            className="stroke-border"
                            strokeWidth={1}
                        />
                        <text
                            x={PAD.left - 6}
                            y={y(value)}
                            textAnchor="end"
                            dominantBaseline="middle"
                            className="fill-muted-foreground font-mono text-[11px]"
                        >
                            {formatter.number(value)}
                        </text>
                    </g>
                ))}
                <text
                    x={PAD.left}
                    y={HEIGHT - 4}
                    className="fill-muted-foreground font-mono text-[11px]"
                >
                    {formatter.number(1)}
                </text>
                <text
                    x={WIDTH - PAD.right}
                    y={HEIGHT - 4}
                    textAnchor="end"
                    className="fill-muted-foreground font-mono text-[11px]"
                >
                    {formatter.number(values.length)}
                </text>
                <polygon points={area} className="fill-current opacity-10" />
                <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        </figure>
    );
}
