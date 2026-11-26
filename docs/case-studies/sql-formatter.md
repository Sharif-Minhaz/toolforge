# SQL Formatter — A Dependency Whose Cost and Casing Had to Be Measured

`src/modules/sql-formatter/` wraps [`sql-formatter`](https://github.com/sql-formatter-org/sql-formatter)
(MIT, pinned at `15.9.0`). Other people run the output against their databases, so
this is a depend, not implement, decision. The package does the formatting; the
module's work is everything the package does not tell you.

---

## The parser is quadratic in expression nesting

The package lexes, then runs an Earley parser (`nearley`) over the tokens. Flat
input is linear — about 3.7 ms per KiB on a desktop. Nested **expression**
brackets are not:

| Shape                   | Depth 100 | Depth 200 | Depth 400 | Depth 800 |
| ----------------------- | --------- | --------- | --------- | --------- |
| `f(f(…1…))`             | 27 ms     | 104 ms    | 414 ms    | —         |
| `((…1…))`               | 59 ms     | 111 ms    | 499 ms    | 1 705 ms  |
| `ARRAY[ARRAY[…]]`       | 42 ms     | 148 ms    | 532 ms    | —         |
| `(SELECT * FROM (…))`   | 11 ms     | 19 ms     | 56 ms     | —         |

Subqueries are cheap; parenthesised expressions are what explode. A two-kilobyte
shared link of nothing but `f(` would hold a tab, or the MCP endpoint, for
seconds, and 64 KiB of it for far longer. Repeating shallow nests is linear in
their count, so the worst case is roughly _bytes × depth_:

| Depth ceiling | Worst 64 KiB document |
| ------------- | --------------------- |
| 16            | 0.6 s                 |
| 32            | 1.5 s                 |
| 64            | 3.4 s                 |
| 100           | 5.5–6.7 s             |

So `formatSql` refuses `too_deep` above **32** open brackets of any kind, before
the parser sees the text, and `too_large` above **64 KiB**. Real queries nest a
handful deep. The depth count includes brackets inside literals and comments — a
documented shortcut in `measureNestingDepth`, since only absurd input is affected.

The formatter runs on the main thread rather than in a worker: under those two
ceilings, ordinary SQL formats in under a quarter of a second, and the island
memoises on the settled text so a keystroke does not re-parse.

## Recasing keywords is not whitespace-only

`keywordCase` recases whatever the dialect's keyword list contains, and those
lists include words people name columns after. Under `upper`, PostgreSQL's
`month`, `day` and `text` columns come out `MONTH`, `DAY`, `TEXT`; MySQL's `text`
becomes `TEXT` through `dataTypeCase`. That is harmless where unquoted names fold
case — almost everywhere — and is why the default is `preserve`, the only
setting the cross-check proves moves nothing but whitespace.

ClickHouse is the dialect where it is not harmless. Its function names are
case-sensitive (`toDateTime` upper-cased is `TODATETIME`, which does not exist),
and its keyword list catches table names such as `events`. `supportsKeywordCase`
returns `false` for it; `effectiveOptions` forces `preserve`, the select is
disabled with a hint, and the MCP adapter returns the case it actually used.

One reader-facing "keyword case" drives the package's `keywordCase`,
`dataTypeCase` and `functionCase` together, because `SELECT count(*)` under
"upper" reads as a bug. `identifierCase` is never set.

## Errors: position yes, message never

The package throws two shapes. The lexer's is
`Parse error: Unexpected "<10 chars>" at line N column M.`; the parser's comes
from `nearley`, starts `Parse error at token: …`, carries the token (with its
`start` offset) on the error object, and runs to tens of thousands of characters
of grammar rules. `readErrorPosition` takes the token offset when there is one
and the lexer's line and column otherwise, and recounts the column in characters
rather than UTF-16 units. Any other throw is re-raised — a defect, not a refusal.

## The dialect list is frozen

`SQL_DIALECTS` is a literal tuple (`satisfies readonly SqlLanguage[]`) so the
picker renders identically on both sides of hydration. `tsql` is dropped as the
package's alias for `transactsql`. A test compares the tuple with the installed
package's `supportedDialects`, so an upgrade that adds or drops one fails.

## Cross-verification

`node-sql-parser` 5.4.0, in a scratch directory, parsed every entry of
`tests/corpus.ts` before and after formatting — PostgreSQL, MySQL, MariaDB,
SQLite, T-SQL, BigQuery and standard SQL; CTEs, window frames, comments,
literals with newlines and doubled quotes, user functions and casts — under
every keyword case, all three indents, and 0, 1 and 3 blank lines: 243 checks.
`preserve` had to give an identical tree; `upper` and `lower` an identical tree
once names were lower-cased, with string literals compared exactly. A tampered
literal and a renamed column were both detected, so the check can fail. The
approved outputs are pinned in `tests/format.test.ts`.

Two cosmetic package behaviours survived it, both meaning-preserving: a space
before an unknown function's parenthesis (`my_func (x)`), and T-SQL leaving
`preceding` and `row` in lower case under `upper`.
