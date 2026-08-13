# RSA Encrypt / Decrypt — A Padding The Platform Will Not Give You

`src/modules/rsa-encrypt/`. Read before touching the padding picker, the key
importer, or the size ceiling.

---

## The trap

**The tool this page was asked for has two padding schemes. The platform has one.**

Every reference UI for RSA encryption offers OAEP and PKCS1-v1_5, so a request to
build one comes with both. `RSAES-PKCS1-v1_5` is not in the Web Crypto
specification, no browser has ever implemented it, and Bun answers the attempt
with a sentence worth quoting exactly:

```
NotSupportedError: RSAES-PKCS1-v1_5 support is deprecated
```

`jose` v6 dropped `RSA1_5` too, and nothing else in this project's dependency
list implements it. So the three honest options were: ship one padding and say
why, show the second permanently disabled, or hand-write modular exponentiation
and a padding scheme whose entire public history is Bleichenbacher's attack
against it.

The first was chosen, and the reasoning matters more than the outcome:
[decision tree 45](../../CLAUDE.md#45-implement-it-or-depend-on-it) says that
when somebody else reads the output you depend on the reference implementation
rather than writing your own. There is no reference implementation available in a
browser. That is a reason not to ship the feature, not a reason to write one.

What the page does instead is keep the picker. A select with a single option
looks odd for about a second and then answers the question a reader actually has
— *which padding is this?* — where a hard-coded label would not. The hint under
it names the absent scheme, and the article gives it a section. This is the same
shape as the AES tool's missing ECB mode: an absence that is documented in place
is a decision, and one that is silent is a gap.

## Web Crypto reads two containers; people paste four

The generator on `/tools/rsa` can write PKCS#1, so a reader will paste PKCS#1
here — and `importKey` accepts only `spki`, `pkcs8` and `jwk`. Without a fix, the
two halves of this site would not talk to each other.

The fix is the reverse of the generator's unwrapper, in the same shared file:
`wrapPkcs1AsSpki` and `wrapPkcs1AsPkcs8` in `tools/domain/rsa-der.ts`. Both are
framing only — a fixed fifteen-byte `rsaEncryption` AlgorithmIdentifier, a DER
length encoder, and the PKCS#1 bytes untouched in the middle. Nothing
re-encodes the RSA numbers, which is what keeps this out of "hand-writing ASN.1"
territory.

Two things that are easy to get wrong and are pinned by tests:

- **The BIT STRING's leading `0x00`** counts unused bits and is *content*, not
  framing. Omit it and the block parses and then decodes to nonsense.
- **DER requires the shortest length encoding.** 127 must be `7f`, never `81 7f`.
  A reader that tolerated both would still fail to round-trip, because the bytes
  would differ from every other writer's.

Both are checked against `node:crypto` at 1024, 2048 and 4096 bits, which
exercises the short-form cutoff and both long-form widths.

## Detection by trying, not by sniffing

A PEM block says which container it is, so nothing is guessed there. A bare
base64 DER blob says nothing at all.

Rather than walking the ASN.1 a second time to decide, `importDerKey` hands the
bytes to `importKey` as the wrapped container, and if that is refused, wraps them
as PKCS#1 and tries again. Web Crypto's own parser is a better judge of whether
these bytes are a key than a hand-rolled sniffer would be, and the fallback costs
one rejected import.

## Three key failures, three names

The single commonest mistake on this page is the right key under the wrong
toggle, and it needs its own answer rather than a generic one:

| Reason | What actually happened |
| --- | --- |
| `unreadable_key` | Not a key in the declared format at all |
| `wrong_key_kind` | A perfectly good key of the *other* sort — and the message says which |
| `key_rejected` | Parsed, said what it was, and Web Crypto still refused it |

`wrong_key_kind` carries `foundKind`, so the message can say "that is a private
key and the picker says Public" instead of "invalid key".

The same discipline splits the two size failures. `message_too_long` means *this*
message does not fit and quotes both numbers. `hash_too_large_for_key` means *no*
message fits, because the digest is wider than the modulus can carry — telling
that reader to shorten something would be advice they cannot act on.

## The ceiling nobody expects

RFC 8017 gives OAEP's capacity as `k − 2·hLen − 2`. For the default case — a
2048-bit key with SHA-256 — that is **190 bytes**, and RSA does not stream, so
there is no way to send the 191st.

Three consequences, all of them visible in the UI rather than only in the article:

- The figure is shown **under the payload box before it is hit**, computed from
  the modulus of the key actually in the box.
- The refusal repeats it alongside what was typed, and points at the real fix:
  encrypt a symmetric key with RSA, and the message with that.
- A 1024-bit key with SHA-512 needs 130 bytes of overhead inside a 128-byte
  modulus, so it cannot encrypt an empty message. `maxOaepMessageBytes` returns
  `null` there rather than a negative number, and the caller turns that into the
  separate refusal above.

The formula was checked against both runtimes before it was written down: a
message at the computed limit encrypts, and one byte more is refused, for all
three digests.

## A public key cannot decrypt, and the UI has to say so

This is arithmetic, not policy — the private exponent is the only number that
reverses the public one and it is not present in a public key at all. So under
Decrypt the Key Type toggle has exactly one legal answer.

It is **disabled with a sentence beside it**, not hidden. A control that vanishes
between two states reads as a bug; one that is visibly off and explains itself
teaches the rule. `requiredKeyKind` also coerces the value rather than only
disabling the control, so a stale link carrying `?direction=decrypt&keyKind=public`
opens on something that can work.

The opposite direction is allowed and is worth having: pasting a private key
under Encrypt derives the public half from it, through the JWK fields rather than
the DER.

## The fixture is the other tool

`tests/factory.ts` does not hold hand-written PEM blocks. It calls
`rsa/domain/generate.ts` and encrypts against whatever comes out.

That makes the test suite the seam between the two pages: every container the
generator can write is proved importable here, in every combination, and a change
to either module that breaks the pair fails a test rather than a reader. The
end-to-end direction is covered too — `node:crypto`'s OAEP opens what this tool
sealed, and vice versa — because agreeing with yourself proves nothing.

## What the article must keep saying

- **The ciphertext is always one modulus wide.** Five bytes in, 256 bytes out.
- **The same message encrypts differently every time.** OAEP is randomised; a
  test asserts two runs differ, because a stable ciphertext would mean the
  padding was wrong in a way nothing else would catch.
- **Nothing records which hash was used.** A mismatch is silent until decryption
  fails, and OpenSSL defaults `rsa_oaep_md` to SHA-1 when it is not given — which
  never matches anything this page writes. That belongs in the interop section,
  and it is the first thing to check when another system rejects the output.
