import { z } from "zod";

/**
 * The shapes the price feeds promise, checked before a number is believed.
 * Only the fields this tool reads; anything else in the body is ignored.
 */

export const goldApiResponseSchema = z.object({
    currency: z.string(),
    price: z.number().finite().positive(),
    symbol: z.string(),
    updatedAt: z.iso.datetime({ offset: true }),
});

const dateOnly = z.iso.date();

export const fawazMetalResponseSchema = z.object({
    date: dateOnly,
    xau: z.object({ usd: z.number().finite().positive() }).optional(),
    xag: z.object({ usd: z.number().finite().positive() }).optional(),
});

export const fawazUsdResponseSchema = z.object({
    date: dateOnly,
    usd: z.record(z.string(), z.number().finite()),
});

export const frankfurterResponseSchema = z.array(
    z.object({
        date: dateOnly,
        base: z.string(),
        quote: z.string(),
        rate: z.number().finite().positive(),
    }),
);
