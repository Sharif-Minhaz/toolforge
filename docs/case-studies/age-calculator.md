# Age & Bangla Date

`src/modules/age-calculator/` — an age on a job circular's cut-off date,
checked against its limit, with every date named in English, বঙ্গাব্দ and
Hijri; and a converter between the three.

Read it before touching `domain/bangla-calendar.ts`, `domain/age.ts` or
`domain/eligibility.ts`. Each section below is a mistake that is easy to make
again.

---

## "Today" is read once, on the server, in Dhaka

The default cut-off date is today, and today is the one value on this page that
differs per request. `AgeWorkbenchSection` reads the clock after
`await searchParams` (Next refuses the clock in a prerender until something
request-time has been read), turns it into Dhaka's calendar date with
`todayInBangladesh`, and hands the date down as a prop. The island never reads
the clock. A browser-side clock would give the reader's zone during hydration
and the server's during SSR, so a reader in London at 11 pm would get a date
that changed under them.

Dhaka rather than the reader's own zone is deliberate: the circulars count in
Bangladesh. The MCP adapter reads the clock at its own edge, the same way. The
domain functions take dates and never ask what day it is.

`prerender-safety.test.ts` scans the whole shell, including the JSDoc block
above `…Section`. A comment that quotes the clock call literally fails it, so
describe it in words.

## Two revisions of the Bangla calendar, chosen by the date

Bangla Academy's 2019 revision (in force from 1426 BS) gives Boishakh to Ashwin
31 days, Falgun 29 (30 in a leap year) and the rest 30. The 1987 calendar
(1394–1425 BS) gave Boishakh to Bhadro 31 days, Falgun 30 (31 in a leap year)
and the rest 30. Both pin 1 Boishakh to 14 April, and both give Falgun the leap
day exactly when its February has a 29th, which is Gregorian year `BS + 594`.

A date converts under the rule **in force on it**. A certificate issued in 2000
calls 16 December 2000 ২ পৌষ, and a converter that applied the 2019 rule to
every year would say ১ পৌষ. Before 1394 BS no fixed calendar was official (the
months came from the panjika), so the 1987 lengths are applied backwards and
the date carries `beforeReform`, which the UI shows as a note. West Bengal's
astronomical calendar is a different thing and is out of scope.

The fixed points are pinned in the tests from press reports of the revision,
not from this code: 21 Feb = ৮ ফাল্গুন, 26 Mar = ১২ চৈত্র, 16 Dec = ১ পৌষ and
Pohela Falgun = 14 Feb under 2019; 21 Feb = ৯ ফাল্গুন and 16 Dec = ২ পৌষ under 1987.

## Age arithmetic follows `java.time.Period`, not `relativedelta`

The two reference implementations disagree on month-end days. Python's
`relativedelta` and date-fns call 29 Feb 2000 → 28 Feb 2001 a whole year, and
31 Jan → 28 Feb a whole month. `java.time.Period` says 11 months 30 days and
28 days, which matches the subtraction Bangladesh teaches by hand. The `dateutil`
reading would make a leap-day child 18 one day early on a minimum-age check, so
it is not followed (decision tree 45: a control the reader turns, implemented
correctly). `tests/age.test.ts` holds sixty vectors produced by OpenJDK 21. If
you regenerate them, use Java, not Python.

## "At most 30" means through the 30th birthday

Bangladesh's notices read a maximum of N as at most N years, 0 months, 0 days
on the cut-off date. The check is written as "under N the day before the
cut-off" rather than as a comparison of spans. For every birthday the two are
the same, except 29 February: in a common year that birth is never exactly
30y 0m 0d. It goes from 29y 11m 30d on 28 Feb to 30y 0m 1d on 1 Mar, and the
span comparison would wrongly fail them on their own birthday.

The edge dates of birth ("born on or after …") are found by a short search from
an estimate, which is only valid if the checks are monotone in the birth date.
`eligibility.test.ts` brute-forces eight years of cut-offs to prove that holds.

A relaxation date (the 2020 COVID-19 notices' 25 March 2020) is a second chance
at the **maximum only**. The minimum is still counted on the circular's own
date.

## Hijri is arithmetic, held to ICU

The tabular civil calendar is integer arithmetic. `Intl`'s `islamic-civil`
would also work, but it would make the MCP adapter and the island depend on the
host's ICU build. The arithmetic is checked against ICU in `bun test` for every
day from 1950 to 2060, and the test asserts the engine actually ships that
calendar, so the cross-check cannot quietly skip. Bangladesh's moon-sighted date
differs by a day or two, which is what the ±2 adjustment is for. It shifts
every Hijri date the tool names, in both directions.

## A বঙ্গাব্দ date is Bangla script on every page

"২৯ কার্তিক ১৪০৮ বঙ্গাব্দ" on the English page too, not "29 Kartik 1408 BS".
That is how a certificate or a masthead writes it, and transliterations of the
month names vary too much to be useful. So the month names and the era live in
`domain/bangla-names.ts` as data, not as per-locale copy, and the page and the
MCP adapter share one formatter. The line carries `lang="bn"` so a screen reader
switches voice. The note under it saying which revision produced it is still
ordinary copy, in the page's own language.

## Names come from the catalogue, not `Intl`

Gregorian month and weekday names are in the message catalogue alongside the
Hijri ones. CLDR's Bangla spellings have changed between versions
(জানুয়ারী / জানুয়ারি), and a server and a browser on different ICU data would
render different text on each side of hydration. Years go through `digits`
rather than the number formatter, which would group ১৪৩৩ as ১,৪৩৩.
