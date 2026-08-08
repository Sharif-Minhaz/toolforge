# RSA — A Container Web Crypto Will Not Write

`src/modules/rsa/`. Read before touching `der.ts`, the exponent field, or the
split between generating a key and rendering one.

---

## The trap

**Web Crypto exports `spki` and `pkcs8`. It has no `pkcs1`, and it never will.**

Half the tooling that reads an RSA key expects a `BEGIN RSA PRIVATE KEY` block,
and the specification simply does not offer one. The obvious answers are both
wrong:

- Re-encoding the key from its JWK numbers means hand-writing an ASN.1 DER
  writer — INTEGER sign padding, long-form lengths, the lot — and being wrong in
  a way that only shows up in somebody else's parser.
- Skipping PKCS#1 makes the tool useless to everyone whose documentation shows
  that header.

The third answer is the one that is actually true: **a PKCS#1 block is already
inside both containers, verbatim.** `SubjectPublicKeyInfo` carries `RSAPublicKey`
inside a BIT STRING; `PrivateKeyInfo` carries `RSAPrivateKey` inside an OCTET
STRING. So the work is unwrapping, not re-encoding, and the bytes that come out
are the bytes OpenSSL would have written.

`der.ts` is therefore a reader and never a writer. It walks tag-length-value
headers, checks the tags it expects, and slices. It is about 150 lines and it
has no encoder in it at all.

## Proving the claim against something that is not us

"These are the same bytes OpenSSL writes" is a claim about somebody else's
parser, so a test that fed the result back to Web Crypto would prove nothing —
Web Crypto cannot read PKCS#1, which is the entire reason the file exists.

`tests/der.test.ts` hands every block to **`node:crypto`**, a completely separate
ASN.1 implementation with its own PKCS#1 parser and its own DER writer, and
checks three things:

1. `createPublicKey` reads the unwrapped PKCS#1 PEM and re-exports SPKI that
   matches the original byte for byte.
2. The same for `createPrivateKey` and PKCS#8.
3. `node:crypto`'s own `export({ type: "pkcs1", format: "der" })` produces
   exactly what the unwrapper lifted out.

The third is the strongest form: two independent implementations agreeing on
every byte. See
[`../testing.md`](../testing.md#verifying-against-something-that-is-not-you).

## The sign byte

A DER INTEGER is signed. A 2048-bit modulus has its top bit set about half the
time, and when it does the encoder prepends a `0x00` that is padding rather than
magnitude.

Count it and `readModulusBits` reports **2056** for a 2048-bit key — on roughly
half of all runs. That is the shape of bug that passes review, passes one manual
test, and then appears intermittently forever.

`readRsaField` strips leading zeroes before measuring, and the test generates ten
keys in a row and asserts all ten report 1024. One key would find this bug half
the time; ten find it essentially always.

## The capability gap, in the opposite direction to AES

[`aes.md`](aes.md) records a value that works in Bun and Node and fails in
Chrome. This module has the same shape with the roles reversed:

| Public exponent | Bun | Node | Chrome, Firefox |
| --- | --- | --- | --- |
| 3 | ✅ | ✅ | ✅ |
| 65537 | ✅ | ✅ | ✅ |
| 17, 65539, any other odd integer | ✅ | ✅ | ❌ |

So `bun test` **cannot** observe the refusal this tool's most interesting
error path exists for. `generate.test.ts` says so out loud rather than pretending
otherwise: the test asserts that an exponent of 17 either mints a key or comes
back as `unsupported_exponent`, and its comment names the browser check that has
to happen elsewhere.

What the module does about it is the same rule as AES, applied to a text field
rather than a picker:

- The field is **not** filtered by a probe. It takes any odd integer of at least
  3, which is what RFC 8017 allows, and both the server pass and the client pass
  render the same control.
- `parsePublicExponent` refuses what is not a public exponent at all
  (`invalid_exponent`), and Web Crypto's refusal of a legal-but-unimplemented one
  is a separate reason (`unsupported_exponent`) naming the two values that work.
- The warning appears **before** the press, under the field, so a reader is told
  what will happen rather than only what did.

Two reasons rather than one is the whole point. Folding them together would tell
a reader their arithmetic was wrong when it was their browser that said no.

## Generating a key and rendering one are different operations

The first draft regenerated on every option change. That is defensible for a
cheap tool and indefensible here: a 4096-bit generation is several seconds of
prime search, and paying it to switch a display format from PEM to JWK is the
tool punishing curiosity.

The split is `RsaKeyMaterial` — every representation of one key at once — and
`renderRsaKeyPair`, which is pure and runs during render. What follows from it:

- **Four settings are minted into the key**: its size, its exponent, its
  algorithm and its hash. `isMaterialStale` compares exactly those.
- **The container and the rendering are not**, so switching them is free.
- A stale pair is **dimmed, not discarded**. The keys on screen are still real
  keys; the status strip says they no longer match the settings above them. This
  is the same doctrine as the AES output panel — never blank a result the reader
  might still want.

## What the article has to keep saying

Three claims that are easy to overstate, and are deliberately hedged:

- **The hash mostly does not reach the file.** It is chosen again at import time,
  so a PEM block generally carries no record of it; a JWK's `alg` always does.
  "Generally" is doing real work there — RFC 4055 lets a PSS key record its hash
  in the algorithm parameters, and engines differ.
- **The PKCS#8 public half is not a PKCS#8 anything.** It is a
  `SubjectPublicKeyInfo`, from a different specification. Only PKCS#1's two
  headers read as a matching pair, and the naming asymmetry catches people out.
- **PKCS#1 carries no algorithm identifier at all**, so the same PKCS#1 block
  comes out whichever usage was selected.

## Nothing is generated on the server

`page.tsx` computes options and nothing else. A private key minted in a route
handler would have to cross the network to reach the person it belongs to, which
is the one thing a key generator must not do — so the workbench opens with two
empty panels and the first key is minted by the press.

That also means there is no hydration risk to manage here: no randomness in a
`useState` initialiser, because there is no randomness in the initial render at
all.
