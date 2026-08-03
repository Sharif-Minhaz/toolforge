import type { PixelSize } from "@/modules/tools/types";
import { MAX_COMPONENTS, MIN_COMPONENTS } from "./constants";
import type { AspectRatio } from "../types";

/**
 * Ratio labels are data, not copy — "16:9" is the same in every language — so
 * they are parsed rather than looked up, and rendered as themselves.
 */
export function parseAspectRatio(ratio: AspectRatio): PixelSize {
    const [width, height] = ratio.split(":").map(Number);

    return { width, height };
}

/**
 * Scales a shape so its longest edge is exactly `edge`.
 *
 * Unlike `fitWithinEdge`, this enlarges as well as shrinks: a hash is a
 * continuous function rather than a grid of samples, so painting it larger than
 * whatever it was made from costs nothing and loses nothing. The short edge is
 * floored at one pixel, so an extreme panorama still produces a decodable PNG.
 */
export function placeholderSize(shape: PixelSize, edge: number): PixelSize {
    const longest = Math.max(shape.width, shape.height);

    if (longest <= 0 || edge <= 0) {
        return { width: 1, height: 1 };
    }

    const scale = edge / longest;

    return {
        width: Math.max(1, Math.round(shape.width * scale)),
        height: Math.max(1, Math.round(shape.height * scale)),
    };
}

/** The shape a run should paint: the picture's own while encoding, the picked ratio otherwise. */
export function targetShape(source: PixelSize | null, ratio: AspectRatio): PixelSize {
    return source !== null && source.width > 0 && source.height > 0
        ? source
        : parseAspectRatio(ratio);
}

/**
 * How many coefficients a fitted pair may spend.
 *
 * Twenty-eight, not the twelve a flat 4 × 3 default spends, and the number was
 * chosen by looking at the output rather than by taste: on a landscape
 * photograph the three separate rock formations merge into one red band at
 * 5 × 3 and resolve into three at 7 × 4. That step happens at 28 and not
 * before. It caps a fitted hash at 60 characters, which is still a string in a
 * database column, and the reader can spend less by hand.
 */
export const COMPONENT_BUDGET = 28;

/** How strongly the shape of the grid outweighs spending the whole budget. */
const SHAPE_WEIGHT = 4;

/**
 * Picks a detail pair for a picture's proportions.
 *
 * A grid of 4 × 3 over a 16:9 photograph spends its vertical coefficients on
 * detail that is not there and starves the direction that is, which is most of
 * why a default blur can look nothing like its picture. The specification says
 * to match the components to the aspect ratio; this is that rule, made
 * concrete.
 *
 * Distance is measured on `log(x / y)`, so 2:1 and 1:2 are equally far from
 * square and a wide picture and its portrait rotation get mirrored grids. The
 * budget term is the tiebreak: among pairs of the same shape, spend more of it.
 */
export function fitComponents(
    shape: PixelSize,
    budget: number = COMPONENT_BUDGET,
): { componentX: number; componentY: number } {
    const ratio = shape.width > 0 && shape.height > 0 ? shape.width / shape.height : 1;
    const target = Math.log(ratio);

    let best = { componentX: MIN_COMPONENTS, componentY: MIN_COMPONENTS };
    let bestScore = Number.POSITIVE_INFINITY;

    for (let componentX = MIN_COMPONENTS; componentX <= MAX_COMPONENTS; componentX += 1) {
        for (let componentY = MIN_COMPONENTS; componentY <= MAX_COMPONENTS; componentY += 1) {
            const spend = componentX * componentY;

            if (spend > budget) {
                continue;
            }

            const shapeError = Math.abs(Math.log(componentX / componentY) - target);
            const score = shapeError * SHAPE_WEIGHT + (budget - spend) / budget;

            if (score < bestScore) {
                bestScore = score;
                best = { componentX, componentY };
            }
        }
    }

    return best;
}
