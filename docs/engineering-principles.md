# Engineering Principles

The doctrines that recur across modules. Each one was learned somewhere specific;
the link goes to the full story. This file states the principle and nothing more,
so that adding a case study never means editing this one.

---

## General principles

- Prefer simplicity and maintainability.
- Keep files focused on a single responsibility.
- Avoid unnecessary abstractions and duplicated logic.
- Use strict typing. Never use `any`.
- Never disable a TypeScript or ESLint rule — restructure the code instead.
- Functions do one thing. Prefer early returns. Avoid deep nesting.
- Refactor duplication immediately.
- Leave the codebase cleaner than you found it.

---

## Depend, or implement?

**Implement it yourself when the output is only ever read here. Depend on the
reference implementation when somebody else has to read it.**

A wrong pattern in a fingerprint table is one wrong row on one page. A
hand-rolled Decimal128, or a re-reading of the TOON spec, produces bytes that
only this site can read — which is precisely what a converter is not for.

Check a dependency before taking it: transitive dependency count, and whether it
is maintained by the format's own owner. Both of the BSON module's are zero-dep
and owned by the format's maintainer;
[`case-studies/domain-inspector.md`](case-studies/domain-inspector.md) explains
why the opposite call was right for the signature table.

See [`case-studies/bson.md`](case-studies/bson.md).

**A library's defaults are not your guarantee.** Read what the defaults do to
your data before assuming a round trip is lossless, and pin the reason at the
constant — see the `promoteValues` / `relaxed` notes in the same file.

---

## Match the mechanism to the cost

The repository's default for typed input is a 300 ms debounce. It is the default,
not the rule. Ask what the derivation costs before applying it:

```
Is the derivation expensive?
├─ Yes → debounce it (300 ms).
├─ No, and the input is controlled by the derived value
│         → never debounce. The keystroke would be reverted and reappear.
│           (patterns/derived-state-editors.md)
├─ No, and it is a filter over a few hundred strings in memory
│         → never debounce. A list a third of a second behind the caret
│           reads as broken. (patterns/input-suggestions.md)
└─ It sits behind a caret and cannot lag at all (syntax highlighting)
          → do not debounce; impose a length ceiling instead.
            (patterns/syntax-highlighting.md)
```

Where a debounce is deliberately absent, say so in a comment.

---

## Earn every warning

A warning that is usually wrong is one people stop reading.

Relaxed Extended JSON loses a `Double` holding a whole number and any int64 past
±2⁵³ — and preserves everything else, which is most real documents. So a standing
"this may be lossy" banner is wrong most of the time. `readBson` instead writes
the relaxed result back to BSON and compares bytes with what arrived, so the note
appears only when it is true. One extra serialize is a cheap price for a warning
that means something.

See [`case-studies/bson.md`](case-studies/bson.md).

**A signal with an innocent explanation must carry it.** The Domain Inspector's
propagation card can show divergence because a change is still spreading, or
because the host uses GeoDNS steering — and from one vantage point the two are
indistinguishable. Amber with no sentence beside it reads as "your change is
broken", which trains people to ignore the signal. See
[`patterns/maps.md`](patterns/maps.md).

---

## Say what you cannot keep

This site's standing promise is that nothing is uploaded. A tool that cannot keep
that promise carries the correction **in its own copy, above its controls** —
what is sent, to whom, and what the far end will see in its log — rather than
leaving the site-wide claim to cover it.

The Port Scanner's disclosure panel sits above the form, not in the article
underneath: a reader deserves to know whose name lands in the target's log before
they press anything, not after. See
[`case-studies/port-scanner.md`](case-studies/port-scanner.md) and
[`case-studies/domain-inspector.md`](case-studies/domain-inspector.md).

The same rule at a smaller scale: **copy that overstates teaches readers to skip
the copy that does not.** Once the browser keeps a copy of an edit URL, "shown
once, save it now or lose it forever" is no longer true and must stop being said.
See [`patterns/browser-persistence.md`](patterns/browser-persistence.md).

---

## Say what was dropped, and what was adapted

Every conversion loses something, and each target loses a different third. A
`fetch` that quietly lost `--insecure` looks correct right up to the first
self-signed certificate.

Take a capability record per target and turn everything unsupported into a typed
note the UI lists under the output. Carry the _adapted_ cases the same way:
`-m 15` becoming `AbortSignal.timeout(15000)` is not a loss, but it is not
recognisable either.

See [`case-studies/curl.md`](case-studies/curl.md).

**Where being faithful would produce a worse artefact, say so instead.** Decide
per runtime, and write down which way and why — the `redirect: "manual"` decision
in the same file is the worked example.

---

## Three outcomes get three states

Open means the handshake completed; closed means a reset came back, which took a
reachable machine to send; filtered means nothing came back at all. Folding the
last two together is a false statement about the network.

Where a measurement has three outcomes, three is what the UI shows — and a run
that comes back entirely in one state gets a sentence saying so, rather than
being read as a clean bill of health.

See [`case-studies/port-scanner.md`](case-studies/port-scanner.md).

The same rule applies to routing: a path that exists under another method is a
different fact from a path that does not exist. See
[`case-studies/mock-server.md`](case-studies/mock-server.md).

---

## Answer the empty case per reason

"Nothing matches what you typed", "this route has never been called" and "cookie
names are not recorded" lead somewhere completely different. One shared "no
results" is the same dead end the plain text box was.

Where a fact is _structurally_ unavailable — the cookie header is redacted before
a log row is written — say so, rather than implying it will fill in later.

See [`patterns/input-suggestions.md`](patterns/input-suggestions.md).

---

## Leave a way out

A limit that refuses every write is a trap whose only escape is discarding the
whole document. `isGrowingMethod` refuses `POST`, `PUT` and `PATCH` at the ceiling
and deliberately lets `DELETE` through, so a full server can always be emptied by
the person who filled it.

And **warn before you lock**: a limit somebody meets with no notice reads as a
fault in the tool.

See [`patterns/growth-ceilings.md`](patterns/growth-ceilings.md).

---

## Cloning behaviour: match, diverge, or refuse

When reimplementing something other people already run, you will meet behaviour
in the reference that looks like a bug. Decide per behaviour, and write the
decision at the line:

```
Does this behaviour change bytes or responses other people read?
├─ Yes → match it, defect and all. A hash or a response that differs from
│        the reference is a worse answer than one that is technically nicer.
├─ It is a defect in a control the reader turns
│      → implement it correctly, and exclude that value from the cross-check.
└─ The input is malformed and no working client sends it
       → diverging is allowed. Prefer a refusal to a silent guess, and say so.
```

The question is not "is this a bug" but **"would diverging make the two disagree
on something somebody actually does"**.

Worked both ways:
[`case-studies/blurhash.md`](case-studies/blurhash.md) (a defect in a control —
do not match) and [`case-studies/json-server.md`](case-studies/json-server.md)
(a defect in a response — match it).

A constant that looks wrong and is deliberate needs a comment saying which rule
it is following, or the next reader "fixes" it and the cross-check goes red with
no explanation of what it was for.

---

## Ordering gates by cost

When several checks guard one action, run the cheap local ones first:

```
1. Shape and syntax        free, local — a typo costs nothing
2. Capability / arity      still local
3. Human challenge         before the quota, or a script burns a stranger's
                           allowance by replaying their address
4. Quota / rate limit      a database write; the only gate that bounds volume
5. The network             last
```

Everything above the quota refuses one bad request; the quota is what refuses the
thousandth good one. See [`security.md`](security.md),
[`case-studies/port-scanner.md`](case-studies/port-scanner.md) and
[`patterns/outbound-requests.md`](patterns/outbound-requests.md).

---

## Render the output and look at it

A cross-check proves you implemented the format. It says nothing about whether
the tool built on it is any good, and no amount of staring at the codec finds a
defect that is not in the codec.

When a reader says the output is not good enough, take it as a claim about the
output. Reach for the renderer before the debugger. See
[`case-studies/blurhash.md`](case-studies/blurhash.md) and
[`testing.md`](testing.md).
