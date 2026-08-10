# The Opening Section of a Tool Article

`hash/components/hash-article.tsx` and
`rsa-encrypt/components/rsa-crypt-article.tsx` are the shape to copy for the
first section of every tool article — the one a reader hits before they have
decided whether the page is the one they wanted.

Every tool article follows it now. A new one starts here rather than arriving at
it later.

Everything below it may stay as long as it needs to be. The tables in
particular are the part readers come back for, and their structure is not up for
change here.

**Two halves, different reach.** The _length_ rule below is about the opening
section only. The _code markup_ rules are about the whole article — paragraphs,
list items, notes, table cells and FAQ answers alike. A `SHA-512` that is boxed
in the opening and bare in the table beneath it is worse than neither.

---

## Two short paragraphs, one worked example, in that order

```
p1        what the thing is, in two sentences
example   one line: an input, an arrow, what comes back
p2        the one thing that decides how you use it
```

The old shape was three to five dense paragraphs of correct prose that nobody
finished. The example is the part that survives skimming: a reader who reads
none of the sentences still learns the shape of the output from the line.

Anything the two paragraphs cannot hold has a section of its own further down —
the opening links to it or trusts the table of contents. Facts do not get
deleted to make room; they get moved.

## The example is a line, not a code block

`ArticleExample` in `tools/components/article-section.tsx` renders one line with
a left rule. It is prose with code in it, not a listing:

```
hello → 2cf24dba…938b9824 — sha-256, always 64 hex characters,
                            whether the input was one byte or a gigabyte
```

Elide the boring middle of a long value with `…` rather than wrapping four lines
of hex. A block belongs in an article when the shape of the thing _is_ the
lesson — a `db.json` document, a cron expression, a curl command. Reach for
`CodeBlock` there and keep the opening line for everything else.

Values in the example are real. `2cf24dba…938b9824` is what `sha-256` actually
returns for `hello`; a made-up digest in an opening paragraph is a defect the
same way a made-up table row would be.

## Which words are code is a fact about the sentence

So it lives in the catalogue, not the component. A message carries the markup:

```jsonc
"example": "<code>hello</code> → <code>2cf24dba…938b9824</code> — <code>sha-256</code>, always 64 hex characters"
```

and the component renders it with the shared tag map:

```tsx
<p>{t.rich("understanding.p1", ARTICLE_TAGS)}</p>
<ArticleExample>{t.rich("understanding.example", ARTICLE_TAGS)}</ArticleExample>
```

`ARTICLE_TAGS` maps `<code>` to `InlineCode`, which is deliberately the same
box the Markdown preview gives inline code — `sha-256` reads identically whether
an article author wrote it or a pasted document produced it.

The alternative — the component splitting a sentence and wrapping the technical
words itself — cannot survive translation, because `en` and `bn` do not agree
about word order. This way both catalogues mark up the same terms and neither
constrains the other's grammar.

**What gets the box:** algorithm names (`sha-256`, `bcrypt`, `argon2id`),
filenames (`db.json`), flags, headers, literal values, API names
(`Web Crypto`), wire identifiers (`RSA-OAEP`, `AES-GCM`).

**What does not:** the tool's own subject repeated in every sentence. An RSA
article that boxes the word RSA nine times has made the page harder to read, not
easier — the whole page is about RSA. Box the identifier, not the topic.

## Backticks do nothing

There is no Markdown anywhere in the message pipeline. A value written as

```jsonc
"p1": "Decrypt it elsewhere. `openssl pkeyutl -decrypt -inkey private.pem …` opens what this page wrote."
```

reaches the reader with the quotes still around it, in a font that has not
changed. This was live on four tools before anybody noticed, which is why
`tools/tests/messages.test.ts` fails on a backtick in any message outside a
short quarantine list. That list is empty; keep it that way.

## A brace or an angle bracket has to be escaped

The same message is ICU MessageFormat, so `{` opens an argument and `<` opens a
tag. Both are ordinary characters in the values these articles quote, and both
have to be wrapped in apostrophes to survive:

```jsonc
"example": "<code>'{'\"id\":42'}'</code> → the same document over seven indented lines"
"groupsExample": "<code>(?'<'year>\\d'{'4'}')</code> captures four digits as <code>year</code>."
```

A lone apostrophe inside a `<code>` span needs doubling — `<code>''</code>` —
because `'<` would otherwise swallow the closing tag. An unescaped one does not
throw: next-intl reports `INVALID_MESSAGE` and renders the key path where the
words should be, which is why the test parses every message rather than trusting
the page to complain.

## A marked-up answer still owes the JSON-LD a plain string

FAQ answers are read twice — the accordion shows them, `buildToolJsonLd` puts
them in structured data — and structured data can hold neither an element nor a
literal `<code>`. One catalogue string serves both:

```ts
{
    question: t("faq.q1"),
    answer: t.markup("faq.a1", PLAIN_TAGS),   // string, tags stripped → JSON-LD
    answerNode: t.rich("faq.a1", ARTICLE_TAGS), // elements → the panel
}
```

`FaqEntry.answerNode` is optional; an answer with no markup keeps the one-line
form. The same split applies anywhere a message has to be a string —
`alt` text, `title`, metadata.

## Both catalogues, and the digits too

`en` and `bn` get the tags key-for-key. Inside `<code>` the value is a literal
and stays ASCII in both. Outside it, Bangla prose takes Bangla digits — ২৫৬
বাইট, ৬৪টি হেক্স অক্ষর — the same rule as everywhere else
([`../internationalization.md`](../internationalization.md)).

## A disclosure is not a paragraph you can cut

If the opening was where a tool said "nothing is uploaded", the trimmed opening
still says it — folded into `p2` rather than given a paragraph. Rule 31 is about
where a limitation appears, and the article's first section is often the only
place it appeared.
