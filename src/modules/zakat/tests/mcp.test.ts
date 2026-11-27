import { describe, expect, test } from "bun:test";

import { zakatCalculatorCalculateTool } from "@/modules/mcp/tools/zakat-calculator";

// The same figures as the domain tests, through the adapter's own schema:
// pure gold 12,000 a gram, pure silver 120.
const PRICES = { goldPricePerGram: "12000", silverPricePerGram: "120" };

describe("toolforge_zakat_calculator_calculate", () => {
    test("is the page's figure: 2.5% of the whole net amount", async () => {
        const outcome = await zakatCalculatorCalculateTool.run({
            ...PRICES,
            money: { cash: "1,000,000", debtsDueNow: "100000" },
        });

        expect(outcome).toMatchObject({
            ok: true,
            data: { verdict: "due", payable: "22500.00", currency: "BDT" },
        });
    });

    test("the majority view exempts worn jewellery the Hanafi view counts", async () => {
        const metals = [
            { metal: "gold", label: "", weight: "7.5", unit: "vori", karat: 22, use: "jewellery" },
        ];
        const hanafi = await zakatCalculatorCalculateTool.run({ ...PRICES, metals });
        const majority = await zakatCalculatorCalculateTool.run({
            ...PRICES,
            metals,
            view: "majority",
        });

        expect(hanafi).toMatchObject({ ok: true, data: { verdict: "due", payable: "24057.00" } });
        expect(majority).toMatchObject({ ok: true, data: { verdict: "nothing" } });
    });

    test("a refusal keeps the domain's own reason", async () => {
        const outcome = await zakatCalculatorCalculateTool.run({
            ...PRICES,
            money: { cash: "12a" },
        });

        expect(outcome).toMatchObject({ ok: false, reason: "invalid_amount" });
    });
});
