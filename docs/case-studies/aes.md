# AES — A Capability That Differs Per Browser

`src/modules/aes/`. Read before touching the mode table, the key derivation, or
the key-size picker.

---

## The trap

**Chrome's Web Crypto does not implement AES-192. Firefox, Node and Bun all do.**

Every probe run while building this passed:

```bash
bun  -e '...' # AES-CBC 192: ok
node -e '...' # AES-CBC 192: ok
```

So `bun test` is green, `bunx tsc --noEmit` is green, and the tool is broken for
roughly two thirds of its visitors on one of the three values in its own picker.
This is [pitfall 1](../../.claude/skills/add-tool/references/pitfalls.md) with a
new face: the runtimes that agree are not the runtime that matters.

## What the tool does about it

The rule from [`../hydration-and-platform-pitfalls.md`](../hydration-and-platform-pitfalls.md)
answers it exactly: **keep the option list static, and fail at operation time.**

- `AES_KEY_SIZES` is a frozen literal tuple. It is never filtered by a probe, so
  the server pass and the client pass render the same three options and hydration
  has nothing to reconcile.
- `importAesKey` catches, and returns `unsupported_key_size` — its own named
  refusal, which the UI turns into a sentence naming the browser rather than the
  algorithm.
- The test asserts the real result where the runtime supports the size and the
  documented refusal where it does not, so it means something under either:

```ts
if (!(await supportsKeySize(keySize))) {
    expect(result).toEqual({ ok: false, reason: "unsupported_key_size" });

    return;
}
```

**`bun test` cannot reach the refusal branch on this machine.** Nothing in the
suite proves the Chrome path; only opening Chrome does. Say so in a handoff
rather than letting a green run imply otherwise.

---

## The other thing that is easy to get wrong

**An unauthenticated mode cannot report a wrong key.** CBC and CTR transform
bytes either way. Under CTR a wrong key always "succeeds"; under CBC it succeeds
about once in 256 attempts, when the noise in the final block happens to be a
valid PKCS#7 trailer. The only thing that ever complains is the UTF-8 reader
downstream — and switching the output to Hex silences even that.

That is why `authentication_failed` and `decryption_failed` are two reasons
rather than one, why GCM is the default, and why the workbench carries a standing
line under the output saying which of the two the current mode is. A tool that
folded them together would be hiding the single fact an authenticated mode exists
to provide.

The behaviour is pinned by a test that asserts CTR decrypts confidently with the
wrong key, because it is a property of the mode rather than a defect to fix.

---

## Cross-verification

Ciphertext is read by other people, so
[rule 45](../../CLAUDE.md#decision-trees) applies: depend on the reference
implementation, and check against something that is not you.

Every constant in `tests/vectors.test.ts` is a published vector — NIST SP 800-38A
appendices F.2 and F.5 for CBC and CTR, the GCM specification's own test cases,
and the standard PBKDF2-HMAC-SHA256 vectors — and every one was re-computed
through `node:crypto` (OpenSSL) before being pinned. That second step is not
ceremony: it is what turns a remembered constant into a checked one.

Two details the vectors force you to notice:

- **CBC vectors are unpadded.** Web Crypto always applies PKCS#7, so encrypting
  the four-block NIST plaintext yields five blocks. The first four match exactly,
  because CBC chaining does not run backwards; the assertion is a prefix match
  with the total length pinned alongside it.
- **GCM's tag is part of the output.** Web Crypto returns ciphertext‖tag as one
  value where most other libraries hand the tag back separately. Anyone
  reproducing this elsewhere needs to know the trailing bytes are the tag — as
  many as the tag width says — which is why the article says so.
- **A truncated GCM tag is genuine truncation.** The seven legal widths were
  each computed through `createCipheriv`'s `authTagLength` and pinned, and they
  confirm it: the 96-bit tag is the first twelve bytes of the 128-bit one. That
  makes the whole table one vector rather than seven independent claims, and it
  is why `tagBytesFor` can be arithmetic instead of a lookup.

The tag width is **not recorded in the ciphertext**. Like the key and the IV it
has to be agreed out of band, and decrypting with the wrong width reads part of
the tag as ciphertext, so the check fails — the authenticated mode working, not
a fault. Shortening it is a real security decision, so the standing line under
the output turns from success to warning below 128 bits and names the width
rather than letting it pass unremarked.

---

## GCM's nonce width is a parameter, not a constant

The first real interop test failed, and the error came from the *other* tool:

```
Invalid IV length. Expected 16 bytes, but got 12 bytes.
```

Twelve bytes is what NIST SP 800-38D recommends and what this tool draws. But
GCM accepts a nonce of **any** length — ninety-six bits is used directly, and
every other width is run through GHASH first. Those are two different
constructions producing two different keystreams, both legal. Plenty of
libraries (Java's `GCMParameterSpec` among them) default to sixteen, so a tool
that hard-codes twelve simply cannot read what they wrote.

Three things fell out of fixing it:

- **The width is variable only for GCM.** For CBC and CTR the IV *is* a block —
  sixteen bytes is arithmetic, not convention — so `acceptsVariableIv` gates it
  and `readIvBytes` enforces one rule per mode.
- **Runtimes disagree at the short end.** Node refuses any nonce under twelve
  bytes; Bun accepts a single byte. Same shape as the AES-192 problem, so it
  gets the same answer: the accepted range is a static rule, and the engine's
  opinion is absorbed by a **cached capability probe** (`isIvLengthSupported`)
  that asks *before* the operation. Asking after would surface as a failed tag
  check, which is what a wrong key looks like — sending a reader hunting for
  the wrong problem entirely.
- **Regenerate has to keep the width.** Drawing a fresh nonce at the mode's
  default would silently undo a reader's deliberate choice of sixteen, and the
  next ciphertext would be unreadable by the system they set it for, with
  nothing on screen having changed. `redrawIvHex` reads the width out of the
  field rather than off the mode.

Two OpenSSL-computed vectors pin the non-96-bit path, at sixteen bytes and at
eight, and the eight-byte one asserts the documented refusal on runtimes that
will not take it.

## Why there is no ECB, and no combined output format

Both are deliberate absences, and both are documented in the article rather than
only here.

**ECB** is not in Web Crypto. Offering it would mean writing a block cipher by
hand on a page whose promise is that it does not — and it encrypts identical
plaintext blocks identically, leaving the structure of the data legible in the
ciphertext.

**A `Salted__`-style envelope** would pack the salt, the IV and the ciphertext
into one blob. Several such formats exist, they disagree with each other, and
every one hides a parameter this page exists to show. Three visible values beside
a ciphertext are less convenient and considerably easier to get right.

---

## The file path is deliberately asymmetric

Encrypting a file takes its **bytes** as the plaintext. Decrypting a file reads
it as **text**. That looks like an inconsistency and is the opposite: it is what
makes the round trip close.

The output of this tool is always text — hex or base64 — so a ciphertext saved
from it is a `.txt`. If decryption read files as raw bytes, the file you just
saved would not be the file you could open. Reading it as text means:

> open a picture → encrypt → download the text → later, open that text →
> decrypt → press **Bytes** → the picture

Three consequences that had to be handled rather than hidden:

- **The plaintext encoding is disabled while encrypting a file.** One predicate,
  `supportsPlaintextEncoding`, shared by the cipher and the control — a setting
  that cannot apply is never left accepting a value that changes nothing. Were it
  still read, those bytes would go through a UTF-8 encoder that cannot represent
  them and the ciphertext would be of something else entirely.
- **`AesSuccess` carries `bytes` as well as `output`.** A decrypted picture is
  bytes; rendering it as base64 and leaving the reader to decode that elsewhere
  would be a round trip the tool declined to finish.
- **Decrypting a file usually refuses first.** Its plaintext is not valid UTF-8,
  so the output box says `undecodable_text` until the plaintext encoding is
  switched to Hex. That is the *same* refusal that reports a wrong key, and it
  keeps its name rather than being softened into an empty box. The message names
  Hex as the way out, and a test pins the behaviour so nobody later "fixes" it
  into silence.

The `source` object is `useMemo`'d in the island. That is not an optimisation —
it is an effect dependency, and a fresh object per render would re-run the cipher
forever.

---

## Two smaller notes

**`Uint8Array` is not `BufferSource`.** TypeScript's `Uint8Array` defaults to
`Uint8Array<ArrayBufferLike>`, which Web Crypto refuses because it might be
backed by a `SharedArrayBuffer`. `hexToBytes` and `base64ToBytes` in
`tools/domain/` now name their buffer type, and the module has a `CipherBytes`
alias, so no call site needs a defensive copy or an assertion.

**PBKDF2 is memoised in the island, not in the domain.** Six hundred thousand
rounds is most of a second, and it depends on far less than the cipher does.
`aesKeyCacheKey` is exported from the same file that consumes it, so the cache key
and the derivation cannot drift apart — and it deliberately omits the salt and the
iteration count for a raw key, which never read them.

---

## The generalised rule

A capability probe that agrees across your test runtimes has told you nothing
about the browser. Freeze the option list, name the refusal, assert both branches,
and say plainly which one your tests could not reach.
