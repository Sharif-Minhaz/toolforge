# Number to Words

`src/modules/number-to-words/` — a typed number in English and Bangla words at
once, as a cardinal or as a cheque amount.

Read it before touching `domain/bangla.ts`, `domain/english.ts` or the parser.

---

## Bangla below a hundred is a table, not a rule

Every Bangla number below a hundred has a word of its own — একুশ, not বিশ এক
— and several have two spellings in use (বিয়াল্লিশ / বেয়াল্লিশ, বায়ান্ন /
বাহান্ন, ষোলো / ষোল). The table was compared entry by entry with the `bn-BD`
locale of `to-words` and agrees on all hundred once both sides are NFC; the
one apparent mismatch, at ৯৬, was `to-words` writing য় precomposed. `n2words`
disagrees with both on five spellings. If a reader reports a "wrong" word,
check which spelling they mean before changing the table — the test names the
irregular entries it pins.

## Written register, on purpose

শত not শো, লক্ষ not লাখ, "এক শত" with its এক. A number in words is almost
always going onto something formal, and that is the register a cheque is
written in. The FAQ says so, because a reader who speaks শো will otherwise
read it as a mistake.

## Above a crore, the traditional ladder

Bangla climbs হাজার, লক্ষ, কোটি, আরব (10⁹), খরব (10¹¹), নীল (10¹³), পদ্ম (10¹⁵),
শঙ্খ (10¹⁷), each a hundred times the last; past শঙ্খ the count of শঙ্খ nests,
so 10¹⁹ is এক শত শঙ্খ. `indian-scale.ts` splits the number once and both
languages name the rungs, so the English lakh/crore line cannot count
differently from the Bangla one. An earlier version nested কোটি instead
(10¹² as এক লক্ষ কোটি); readers asked for the traditional names.

English defaults to the short scale, million through duotrigintillion (10⁹⁹),
which is where the 102-digit ceiling comes from: both lines stop at the same
place, and the parser refuses past it rather than inventing a name. Exactly
10¹⁰⁰ reads "one googol" — a name for one number, not a rung, so a googol and
one is "ten duotrigintillion one". The Bangla line has no such word and nests.

## No floating point anywhere

The number is parsed as digit strings and spelled through `BigInt`. A
JavaScript number would round anything past fifteen digits, and
`Intl.NumberFormat` takes one — which is why `numerals.ts` groups by hand.
The MCP adapter takes the number as a string for the same reason.

## An amount is refused, not rounded

A currency amount with a third decimal is `too_many_decimals`, and a negative
one is `negative_amount`. Rounding would put a sum on a cheque that nobody
wrote down. `.5` as an amount is fifty paisa: the fraction is hundredths, the
one real difference from a cardinal, and the test pins it.

## Not capped

The field takes a number but is not given `maxLength`: a number cut short by
the browser is a different number. The domain refuses past
`MAX_NUMBER_INPUT_LENGTH` and the meter warns before it.
