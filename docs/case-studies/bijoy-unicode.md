# Bijoy ↔ Unicode Converter

`src/modules/bijoy-unicode/` — Bangla between the SutonnyMJ font encoding and
Unicode, in both directions.

Read it before touching `domain/glyph-table.ts`, `to-unicode.ts` or
`to-bijoy.ts`.

---

## Bijoy is a font, not an encoding

A Bijoy file is Windows-1252 text that a SutonnyMJ font happens to draw as
Bangla: `Avgvi †mvbvi evsjv` underneath, আমার সোনার বাংলা on screen. Two
consequences shape everything here:

- **Order is drawing order.** ি ে ৈ are stored before the cluster they follow;
  ো and ৌ are ে on one side of the cluster and া or ৗ on the other; the reph
  `©` is stored after the cluster it sits on. Unicode wants all three reversed.
  `to-unicode.ts` reads glyphs first and reorders second — doing both in one
  pass is where the older converters' bugs live.
- **English and Bangla are the same bytes.** Nothing in pasted text says which
  font a word was set in, so everything is read as Bijoy. The page and the FAQ
  say so; there is deliberately no "keep English" heuristic. A guess that
  turns a Bangla word into English is worse than an English word that comes
  out as Bangla, because only the second is obvious to the reader.

## Depend or implement: implemented, and why

Decision tree 44 says to depend on the reference implementation when somebody
else reads the output — and a SutonnyMJ font does. There is no reference. The
candidates on npm when this shipped were single-maintainer packages with no
stars, one of them thirteen days old. None is the format's owner; Bijoy has no
published specification at all. So the table is our own, assembled from two
independent converters (`bijoy2unicode`, and `@kovapdf/bijoy-unicode`, which
cites Avro's font table and Gazette documents), with every disagreement
decided in a comment beside the entry.

The packages were read, not run: the session that built this could not execute
downloaded third-party code, so the cross-check was against their tables and
published examples rather than their output. **Running a differential test
against `@kovapdf/bijoy-unicode` in a scratch directory is the cheapest next
check**, and the corpus in `tests/to-bijoy.test.ts` is the input to feed it.

## Codes that mean two things

About a third of SutonnyMJ's codes double as punctuation, and the context
rules in `readGlyphs` are the part most likely to be "fixed" wrongly:

| Code         | Bangla when…                                | Otherwise                         |
| ------------ | ------------------------------------------- | --------------------------------- |
| `©`          | after a consonant or vowel sign             | `©`                               |
| `’`          | after a half-form (hasant)                  | closing quote                     |
| `‘`          | after a half-form                           | opening quote                     |
| `—`          | after a half-form                           | em dash                           |
| `“` `–`      | after a consonant (ু)                       | the punctuation                   |
| `æ`          | after র (ু); after a letter (ম্ন)           | `æ`                               |
| `Í`          | after a half-form (ত); after a letter (ত্ম) | `Í`                               |
| `ø`          | after a letter (্ল)                         | স্ন                               |
| `°` `×` `²`… | in a word                                   | the symbol after a digit or alone |

`æ` is the one the older table gets wrong: reading it as ু everywhere turns
নিম্নলিখিত (`wbæwjwLZ`) into নিুলিখিত. The test pins it.

## The reph goes before the vowel sign

Writing Unicode → Bijoy, `©` is emitted straight after its cluster and before
any vowel sign: নির্বাচন is `wbe©vPb` and কর্তৃক is `KZ©„K`, the order those
familiar spellings use. `@kovapdf/bijoy-unicode` emits it
after the sign instead. Both render the same in SutonnyMJ and the decoder here
reads both orders, so this only matters for byte-for-byte comparison — say so
if a differential test flags it.

## Output is NFC

ড় ঢ় য় come out as letter + nukta, because NFC decomposes the precomposed
code points (they are composition exclusions). That is what search, sort and
databases compare in. Every Bangla string in the module's source that names a
precomposed letter is written as an escape for the same reason.

## Source escapes

The table's keys above U+007F are `\u` escapes, not literal characters: half
of them are invisible (the soft hyphen is a ্ল) or indistinguishable from a
neighbour. Keep it that way — and note that an editor or tool that "helpfully"
unescapes them leaves a soft hyphen in the source that no reviewer will see.
