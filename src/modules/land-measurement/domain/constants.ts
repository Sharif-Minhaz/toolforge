import type {
    BighaRegion,
    KaniRegion,
    LandOptions,
    LandUnit,
    LandUnitGroup,
    ReferenceObject,
} from "../types";

/** The international foot is exactly 0.3048 m, so a square foot is exactly this. */
export const SQUARE_METERS_PER_SQUARE_FOOT = 0.09290304;

/** An acre is 43,560 sq ft by definition, and a শতাংশ is a hundredth of one. */
export const SQUARE_FEET_PER_ACRE = 43_560;
export const SQUARE_FEET_PER_DECIMAL = SQUARE_FEET_PER_ACRE / 100;

/**
 * The government's কাঠা: 720 sq ft, which makes a বিঘা of 20 কাঠা 14,400 sq ft
 * — 33.06 শতাংশ, the "33 শতাংশ বিঘা" every deed in Dhaka assumes.
 */
export const STANDARD_KATHA_SQUARE_FEET = 720;
export const KATHA_PER_BIGHA = 20;
export const CHHATAK_PER_KATHA = 16;

/**
 * The গণ্ডা as the land record gives it: 864 sq ft. The same record also calls
 * it 2 শতাংশ, which would be 871.2 sq ft — the two do not agree. The square
 * feet are kept because the whole chain under it (কড়া 216, ক্রান্তি 72, তিল
 * 3.6) is written in them, and a কানি of 20 গণ্ডা is then 17,280 sq ft:
 * 39.67 শতাংশ, the "40 শতাংশ কানি".
 */
export const STANDARD_GONDA_SQUARE_FEET = 864;
export const GONDA_PER_KANI = 20;
export const KORA_PER_GONDA = 4;
export const KRANTI_PER_KORA = 3;
export const TIL_PER_KRANTI = 20;

/** A হাত is 18 inches, so a বর্গহাত is 1.5 × 1.5 ft. */
export const SQUARE_FEET_PER_SQUARE_HAND = 2.25;

/**
 * District বিঘা sizes, in শতাংশ, from Banglapedia's agrometrology tables.
 * The page pairs district headings over shared lists, so only the sizes it
 * ties to one district are offered here.
 */
export const BIGHA_REGION_DECIMALS: Readonly<Record<BighaRegion, number>> = {
    standard: (STANDARD_KATHA_SQUARE_FEET * KATHA_PER_BIGHA) / SQUARE_FEET_PER_DECIMAL,
    faridpur: 52,
    dinajpur: 48,
    rangpur: 60,
};

/** District কানি sizes, in শতাংশ, from the same tables. */
export const KANI_REGION_DECIMALS: Readonly<Record<KaniRegion, number>> = {
    standard: (STANDARD_GONDA_SQUARE_FEET * GONDA_PER_KANI) / SQUARE_FEET_PER_DECIMAL,
    "comilla-noakhali": 120,
    chittagong: 160,
};

/**
 * A full-size football pitch, the 105 × 68 m FIFA recommends for
 * international matches and most stadiums are built to: 7,140 m².
 */
export const PITCH_LENGTH_METERS = 105;
export const PITCH_WIDTH_METERS = 68;

/**
 * Sizes of the comparison objects, in metres, long side first: a standard
 * single bed; a parking bay as most car parks mark it; the BWF doubles
 * badminton court; the ITF doubles tennis court; the FIFA futsal court at its
 * largest; and the pitch above.
 */
export const REFERENCE_SIZES: Readonly<
    Record<ReferenceObject, { readonly length: number; readonly width: number }>
> = {
    "single-bed": { length: 1.9, width: 0.9 },
    "parking-space": { length: 5, width: 2.5 },
    "badminton-court": { length: 13.4, width: 6.1 },
    "tennis-court": { length: 23.77, width: 10.97 },
    "futsal-court": { length: 40, width: 20 },
    "football-pitch": { length: PITCH_LENGTH_METERS, width: PITCH_WIDTH_METERS },
};

/** Past this many pitches the drawing stops and the count says the rest. */
export const MAX_DRAWN_PITCHES = 30;

/**
 * About 930,000 km² — six Bangladeshes. Past it the number is a typing
 * mistake, and the digits after the point stop meaning anything in a double.
 */
export const MAX_AREA_SQUARE_FEET = 1e13;

/** The box takes one number. Anything longer is a paste gone wrong. */
export const MAX_LAND_INPUT_LENGTH = 40;

export const UNIT_GROUPS: Readonly<Record<LandUnit, LandUnitGroup>> = {
    bigha: "local",
    katha: "local",
    chhatak: "local",
    kani: "local",
    gonda: "local",
    kora: "local",
    kranti: "local",
    til: "local",
    decimal: "local",
    ojutangsho: "local",
    "square-hand": "local",
    acre: "international",
    hectare: "international",
    "square-kilometer": "international",
    "square-meter": "international",
    "square-foot": "international",
    "square-yard": "international",
};

export const DEFAULT_LAND_OPTIONS: LandOptions = {
    unit: "katha",
    bighaRegion: "standard",
    kaniRegion: "standard",
};

/** What the page opens on: five কাঠা, a common Dhaka plot. */
export const LAND_SAMPLE = "5";
