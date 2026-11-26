import { z } from "zod";

import {
    BIGHA_REGION_DECIMALS,
    DEFAULT_LAND_OPTIONS,
    KANI_REGION_DECIMALS,
} from "@/modules/land-measurement/domain/constants";
import { convertLand } from "@/modules/land-measurement/domain/convert";
import { chooseReference } from "@/modules/land-measurement/domain/reference";
import {
    bighaRegionSchema,
    kaniRegionSchema,
    landInputSchema,
    landUnitSchema,
} from "@/modules/land-measurement/validation/land-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

export const landMeasurementConvertTool = defineMcpTool({
    toolId: "land-measurement",
    verb: "convert",
    title: "Convert a land area between Bangladeshi and international units",
    description:
        "Convert a land area into every Bangladeshi and international unit at once — বিঘা (bigha), কাঠা (katha), ছটাক (chhatak), কানি (kani), গণ্ডা (gonda), কড়া (kora), ক্রান্তি (kranti), তিল (til), শতাংশ/শতক (decimal), অযুতাংশ (ojutangsho), বর্গহাত (square hand), acre, hectare, km², m², sq ft and sq yd — and compare it with the largest everyday thing it is at least as big as — a single bed, a car parking space, a badminton, tennis or futsal court, or a 105 × 68 m football pitch. Standard sizes are the government's: কাঠা 720 sq ft, বিঘা 20 কাঠা (33.06 শতাংশ), গণ্ডা 864 sq ft, কানি 20 গণ্ডা (39.67 শতাংশ). বিঘা and কানি vary by district, so `bighaRegion` and `kaniRegion` pick a local size; the units under each (কাঠা and ছটাক; গণ্ডা, কড়া, ক্রান্তি, তিল) scale with it. Accepts Western or Bangla digits.",
    kind: "offline",
    inputSchema: z.object({
        // A string, so Bangla digits and grouping commas arrive as typed.
        value: landInputSchema.describe(
            "The area, as a string of Western or Bangla digits with an optional decimal point and optional commas between digit groups",
        ),
        unit: landUnitSchema.default(DEFAULT_LAND_OPTIONS.unit).describe("The unit `value` is in"),
        bighaRegion: bighaRegionSchema.default(DEFAULT_LAND_OPTIONS.bighaRegion).describe(
            `Size of a বিঘা: ${Object.entries(BIGHA_REGION_DECIMALS)
                .map(([region, decimals]) => `\`${region}\` ${decimals.toFixed(2)} শতাংশ`)
                .join(", ")}`,
        ),
        kaniRegion: kaniRegionSchema.default(DEFAULT_LAND_OPTIONS.kaniRegion).describe(
            `Size of a কানি: ${Object.entries(KANI_REGION_DECIMALS)
                .map(([region, decimals]) => `\`${region}\` ${decimals.toFixed(2)} শতাংশ`)
                .join(", ")}`,
        ),
    }),
    run: ({ value, ...options }) => {
        const result = convertLand(value, options);

        if (!result.ok) {
            return refuseWithReason("Land measurement", result.reason, {
                position: result.position ?? null,
            });
        }

        const conversions = Object.fromEntries(
            result.conversions.map((conversion) => [conversion.unit, conversion.value]),
        );

        const reference = chooseReference(result.squareMeters);

        return succeed(
            `${result.value} ${options.unit} = ${result.squareFeet} sq ft, about ${reference.ratio.toFixed(2)} × ${reference.object}`,
            {
                conversions,
                regions: { bigha: options.bighaRegion, kani: options.kaniRegion },
                comparison: { object: reference.object, ratio: reference.ratio },
                footballPitches: result.pitches.ratio,
            },
        );
    },
});
