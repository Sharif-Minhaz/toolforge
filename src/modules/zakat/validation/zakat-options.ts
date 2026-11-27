import { z } from "zod";

import {
    MAX_AMOUNT_LENGTH,
    MAX_CRYPTO_LINES,
    MAX_LABEL_LENGTH,
    MAX_METAL_ITEMS,
} from "../domain/constants";
import {
    CRYPTO_CODES,
    CURRENCY_CODES,
    DEBT_RULES,
    JEWELLERY_RULES,
    KARAT_METHODS,
    KARATS,
    METAL_USES,
    MINOR_RULES,
    NISAB_BASES,
    NISAB_STANDARDS,
    PRICE_BASES,
    SHARE_METHODS,
    WEIGHT_UNITS,
    YEAR_TYPES,
} from "../types";

export const currencySchema = z.enum(CURRENCY_CODES);

export const priceBasisSchema = z.enum(PRICE_BASES);

export const zakatRulesSchema = z.object({
    nisabStandard: z.enum(NISAB_STANDARDS),
    nisabBasis: z.enum(NISAB_BASES),
    karatMethod: z.enum(KARAT_METHODS),
    jewellery: z.enum(JEWELLERY_RULES),
    year: z.enum(YEAR_TYPES),
    debts: z.enum(DEBT_RULES),
    minors: z.enum(MINOR_RULES),
});

/** An amount as typed; `parseAmount` decides whether it is a number. */
export const amountTextSchema = z.string().max(MAX_AMOUNT_LENGTH);

export const karatSchema = z.union(KARATS.map((karat) => z.literal(karat)));

export const metalItemSchema = z.object({
    metal: z.enum(["gold", "silver"]),
    label: z.string().max(MAX_LABEL_LENGTH),
    weight: amountTextSchema,
    unit: z.enum(WEIGHT_UNITS),
    karat: karatSchema,
    use: z.enum(METAL_USES),
});

export const cryptoLineSchema = z.object({
    coin: z.enum(CRYPTO_CODES),
    amount: amountTextSchema,
});

export const shareMethodSchema = z.enum(SHARE_METHODS);

export const metalListSchema = z.array(metalItemSchema).max(MAX_METAL_ITEMS);

export const cryptoListSchema = z.array(cryptoLineSchema).max(MAX_CRYPTO_LINES);

/**
 * `?currency=USD&view=majority&price=spot` opens the calculator on a reader's
 * own settings. Each field falls back on its own.
 */
export const zakatSearchParamsSchema = z.object({
    currency: currencySchema.optional().catch(undefined),
    view: z.enum(["hanafi", "majority"]).optional().catch(undefined),
    price: priceBasisSchema.optional().catch(undefined),
});
