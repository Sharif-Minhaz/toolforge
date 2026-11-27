# Zakat Calculator

`src/modules/zakat/` — a religious obligation computed to the paisa, under
opinions that differ, at prices read from other people's free feeds.

Read it before touching `domain/calculate.ts`, `domain/exact.ts`, a price
parser, or any rule.

---

## Every opinion is a named rule, never a constant

Scholars disagree on seven things that change the figure. Each is a field of
`ZakatRules`, each option is a literal union, and every hint beside a control
names who holds that view. The research behind them, with sources:

| Rule            | Options                                              | Hanafi default | Sources                                                                                                                                  |
| --------------- | ---------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `nisabStandard` | `tola` 87.48 / 612.36 g, `grams` 85 / 595 g          | `tola`         | 7.5 / 52.5 tola of 11.664 g (Deoband 1758/B); Qaradawi, AAOIFI SS-35                                                                     |
| `nisabBasis`    | `auto`, `silver`, `gold`                             | `auto`         | Gold alone by weight, gold + anything by silver value (Fatawa Darul Uloom Deoband 6/123); MWL Fiqh Council for silver; Qaradawi for gold |
| `karatMethod`   | `majority` (≥ 12 k is full weight), `pure`           | `majority`     | Ibn ʿAbidin via SeekersGuidance, Askimam; al-Nawawi and Ibn Qudamah for pure                                                             |
| `jewellery`     | `zakatable`, `exempt`                                | `zakatable`    | Hanafi, Ibn Baz, Ibn ʿUthaymeen; the Maliki/Shafiʿi/Hanbali majority exempts worn pieces                                                 |
| `year`          | `lunar` 1/40, `solar` 73/2832, `solarRounded` 13/500 | `lunar`        | Dar al-Ifta Egypt 8124, AAOIFI: 2.5 × 365 / 354; As-Sunnah: 2.6%                                                                         |
| `debts`         | `year`, `due`, `all`                                 | `year`         | NZF and the Bangladesh guideline; Ibn Baz / Ibn ʿUthaymeen; Qaradawi                                                                     |
| `minors`        | `exempt`, `zakatable`                                | `exempt`       | Hanafi; the other three schools                                                                                                          |

The two presets in `domain/rules.ts` are starting points. Changing any one
rule turns the view to `custom`, and `compareViews` shows the same holdings
under the other presets and under one-change variants, so a reader sees how
much rests on which opinion. The page says above the controls that this is not
a fatwa (`CLAUDE.md` rule 32).

## Exact arithmetic, one rounding, upwards

`domain/exact.ts` is fractions of two `bigint`s. A price per gram is a price
per troy ounce over `31.1034768`, converted at a rate, times a weight, times
22 / 24, summed with a dozen amounts, times 1/40. In floating point each step
rounds, and on a large estate the drift reaches the paisa — or puts a figure on
the wrong side of nisab. Nothing is rounded until the payable, which is
rounded **up** to the currency's minor unit (`MINOR_DIGITS`), so nobody
underpays by a fraction. Amounts cross to the browser as decimal strings and
are parsed back exactly; `toNumber` exists for `Intl` display only.

`parseAmount` reads the lakh grouping (`1,50,000`), Bangla digits and spaces,
and refuses a minus sign, a second point, exponent notation and the Bangla full
stop `।`, because a guess is a wrong zakat.

## 2.5% of the whole, not of the excess

The commonest calculator bug the research found. Once nisab is met the rate
applies to all net wealth. The test `2.5% of all net wealth` pins it.

## The Hanafi one-metal-alone test is a weight test

Under `auto`, wealth that is gold and nothing else is compared by **weight**
against 87.48 g, and silver and nothing else against 612.36 g — at full weight
or pure content per `karatMethod` — scaled by `net / totalAssets` when debts
reduce it. One taka of cash beside it switches the test to the silver nisab by
value. 7.5 vori of 22 karat jewellery is due
under `majority` and not under `pure`; the tests hold both.

## Aligned with As-Sunnah Foundation, on purpose

As-Sunnah Foundation's calculator (advised by IFA Consultancy) is the one
Bangladeshi readers trust most, so its choices are the defaults here, each
still a control: the silver nisab of 612.36 g shown first, large, at the
market price of pure silver; holdings valued at 83% of the BAJUS price (a 17%
jeweller's deduction — BAJUS's own notice says 15%); a Gregorian year at 2.6%
offered beside the exact 2.577%; traditional (সনাতনী) gold priced from BAJUS;
"gold alone, 7.5 vori; silver alone, 52.5 vori" by weight; and its fields —
amanah, refundable security deposits, partnership or mudaraba shares, unpaid
mahr and earlier years' unpaid zakat as deductible debts, a business loan only
when it bought stock. Its ana is 11.66 ÷ 16; ours is 11.664 ÷ 16 = 0.729 g, the
same vori its tola uses.

**The nisab and the holdings are priced differently.** The nisab is the market
value of a weight of pure metal, so `goldPure` / `silverPure` never carry the
deduction; a piece is worth what it would fetch, so `itemPerGram` does. Mixing
them up moves the threshold by the deduction — 17% — and that is the error.

**Traditional has no karat.** Its purity is read off BAJUS — 22 × traditional ÷
22-karat price — the only published number that describes it. Without BAJUS
the line is refused by name.

## Prices: three feeds, cached per deployment, never invented

`repository/prices.ts` reads gold-api.com (live spot, no key, commercial use
allowed), falls back to currency-api's daily fix (CC0, two CDNs), reads
exchange rates from Frankfurter v2 with currency-api as fallback, and scrapes
BAJUS's notice page. Each source is its own `"use cache"` scope with its own
`cacheLife`, and **throws on failure inside the scope**, so a failure is not
cached for a quarter of an hour. Destinations are constants: this is not the
SSRF problem, but every call has a timeout, a byte ceiling and refuses
redirects. A snapshot part that could not be read is `null`, and the page
disables that price basis and says why; `custom` always works.

Every price is shape-checked with Zod and refused outside a broad plausible
band (`SPOT_BOUNDS_USD_PER_OUNCE`): a feed reporting gold at zero would tell
somebody they owe nothing.

**BAJUS is strict on purpose.** All eight prices must be found or the reading
is `null` — half a table from a redesigned page is worse than none. The notice
date is only in the PDF link's filename. BAJUS prices include VAT and exclude
making charges; sale value (`bajusResale`) is the default for taka because most
scholars value gold at what it would sell for.
Spot is ~27% below BAJUS retail on the day it was built — the two must never be
derived from each other.

## The hawl is Hijri, and the calendar file is not a recurrence

`domain/hawl.ts` uses the tabular calendar shared with the Age Calculator
(`tools/domain/hijri.ts`, checked against ICU's `islamic-civil`) with a ±2-day
moon-sighting adjustment. The `.ics` writes one all-day event per anniversary,
because an `RRULE` would recur on the Gregorian date and drift eleven days a
year. Lines are folded at 75 octets without splitting a Bangla letter.

## What is not covered

ʿUshr on crops, livestock tables and zakat al-fitr. The research is in the
handoff notes if they are added; the livestock tables especially should be
checked by a mufti first.
