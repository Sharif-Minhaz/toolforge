/**
 * Every unit the converter reads and writes. The Bangladeshi units come first,
 * in the two chains they belong to — বিঘা → কাঠা → ছটাক, and কানি → গণ্ডা →
 * কড়া → ক্রান্তি → তিল — then the units defined against the acre, then the
 * international ones.
 */
export const LAND_UNITS = [
    "bigha",
    "katha",
    "chhatak",
    "kani",
    "gonda",
    "kora",
    "kranti",
    "til",
    "decimal",
    "ojutangsho",
    "square-hand",
    "acre",
    "hectare",
    "square-kilometer",
    "square-meter",
    "square-foot",
    "square-yard",
] as const;

export type LandUnit = (typeof LAND_UNITS)[number];

/** The two groups the result is shown in. */
export const LAND_UNIT_GROUPS = ["local", "international"] as const;

export type LandUnitGroup = (typeof LAND_UNIT_GROUPS)[number];

/**
 * How big a বিঘা is. `standard` is the government's 20 কাঠা of 720 sq ft —
 * about 33 শতাংশ — and the rest are district sizes Banglapedia records. The
 * কাঠা and ছটাক are fractions of whichever বিঘা is chosen.
 */
export const BIGHA_REGIONS = ["standard", "faridpur", "dinajpur", "rangpur"] as const;

export type BighaRegion = (typeof BIGHA_REGIONS)[number];

/**
 * How big a কানি is. `standard` is the government's 20 গণ্ডা of 864 sq ft —
 * the "40 শতাংশ কানি" — and the rest are the larger কানি of the south-east.
 * গণ্ডা, কড়া, ক্রান্তি and তিল are fractions of whichever কানি is chosen.
 */
export const KANI_REGIONS = ["standard", "comilla-noakhali", "chittagong"] as const;

export type KaniRegion = (typeof KANI_REGIONS)[number];

export type LandOptions = {
    /** The unit the typed number is in. */
    readonly unit: LandUnit;
    readonly bighaRegion: BighaRegion;
    readonly kaniRegion: KaniRegion;
};

export type LandFailureReason =
    | "empty"
    | "invalid_character"
    | "misplaced_separator"
    | "too_many_points"
    | "no_digits"
    | "negative"
    | "too_large";

export type LandFailure = {
    readonly ok: false;
    readonly reason: LandFailureReason;
    /** 1-based character the problem was found at, where one can be pointed to. */
    readonly position?: number;
};

export type LandConversion = {
    readonly unit: LandUnit;
    readonly group: LandUnitGroup;
    readonly value: number;
};

export type LandSuccess = {
    readonly ok: true;
    /** The typed number, read. */
    readonly value: number;
    /** The same area in square feet, which every conversion passes through. */
    readonly squareFeet: number;
    readonly squareMeters: number;
    /** The area in every unit, in `LAND_UNITS` order. */
    readonly conversions: readonly LandConversion[];
    readonly pitches: PitchComparison;
};

export type LandResult = LandSuccess | LandFailure;

export type NumberParseResult = { readonly ok: true; readonly value: number } | LandFailure;

/**
 * The area drawn on a pitch, in metres from the pitch's top-left corner. A
 * square while one fits between the touchlines; past that it becomes a strip
 * the full width of the pitch, because a square of that area would spill off
 * the sides and no longer show how much of the pitch it covers.
 */
export type PlotShape = {
    readonly kind: "square" | "strip";
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};

export type PitchComparison = {
    /** The area as a multiple of one pitch: 0.25 is a quarter of a pitch. */
    readonly ratio: number;
    /** Pitches the area fills completely. */
    readonly fullPitches: number;
    /** Pitches drawn: the full ones, then one holding what is left, up to the cap. */
    readonly drawnPitches: number;
    /** What the last drawn pitch holds, or `null` when the area is a whole number of pitches. */
    readonly remainder: PlotShape | null;
    /** True when more pitches are needed than are drawn. */
    readonly truncated: boolean;
};

/**
 * Everyday things a plot is compared with, smallest first. Each is the next
 * size up by a factor a reader can still picture — no step is more than
 * about nine of the one before.
 */
export const REFERENCE_OBJECTS = [
    "single-bed",
    "parking-space",
    "badminton-court",
    "tennis-court",
    "futsal-court",
    "football-pitch",
] as const;

export type ReferenceObject = (typeof REFERENCE_OBJECTS)[number];

export type ReferenceComparison = {
    readonly object: ReferenceObject;
    /** The plot as a multiple of the object: 3.2 parking spaces, 0.6 of a bed. */
    readonly ratio: number;
};
