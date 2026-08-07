# Port Scanner — Building the Thing the Guard Was Written Against

`src/modules/port-scanner/` opens a TCP connection to a port on a host somebody
typed.

The address guard's own comment names that as the abuse it exists to prevent —
"use this server as a port scanner with this site's reputation attached" — so this
is the one module in the repository where the guard is **load-bearing rather than
precautionary.** Everything below follows from taking that seriously rather than
from the feature being hard.

---

## Name the property you cannot keep, in the tool, above the controls

This site's promise is that nothing is uploaded. A page cannot open a raw socket,
so a port scan has to run on the server, and the host being scanned sees _our_
address in its logs. That makes the tool an attribution-laundering service by
default.

The disclosure panel therefore sits **above the form**, not in the article
underneath it — a reader deserves to know whose name lands in the target's log
before they press anything, not after.

---

## A limiter that can fail open is not a limiter

Every other degradation on this site falls toward doing the work: no Turnstile key
and a tool renders disabled, no database and the shortener says so. `spendQuota`
inverts that. No `DATABASE_URL`, no `PORT_SCAN_IP_SALT`, an unreachable database,
a thrown transaction — every one of them **refuses the scan**.

Decide which way a gate fails by what happens when it is bypassed, and here that
is an unmetered scanning service.

- **In Postgres, not in memory.** On serverless a per-process counter resets on
  every cold start and each instance counts separately. Shipping one under the
  name "rate limit" is worse than shipping none, because it stops anyone looking
  again.
- **Read and write in one transaction.** Two visitors behind one address arrive
  together; a read-then-write lets both see nine and both write ten.
- **Spend the allowance even when the scan fails.** A refused scan that costs
  nothing is a free retry loop, and retrying is what an abuser does.
- **Store a salted hash of the address, never the address.** The row answers "is
  this the same caller" and nothing else. Unsalted, a table of SHA-256 digests of
  IPv4 addresses is reversible by brute force in seconds — there are only four
  billion. The salt is a secret for that reason, and rotating it resetting every
  window is the correct failure.
- **A fixed window, not a sliding one.** Sliding needs every timestamp kept, and a
  per-scan history of who scanned when is a log this site has no business holding.
  The cost — a caller can spend the tail of one window and the head of the next —
  is written down in `domain/quota.ts` rather than discovered.

---

## Order the gates by what each one costs

Shape, syntax and port parsing are free and local, so a typo costs no challenge,
no database write and no packet. Turnstile comes before the quota, or a script
burns a stranger's allowance by replaying their address without solving anything.
The quota comes before the network, because it is the only gate that limits
_volume_ — everything above it refuses one bad request, and this is what refuses
the thousandth good one.

---

## Say what the tool refuses to do, and mean it

No SYN scan, no banner read, no version probe: the socket is opened, the handshake
observed, and it is destroyed without a byte crossing it.

The service column is a static table of what each port is _registered_ for, so a
web server on 22 is labelled SSH and the label is wrong — which the copy says,
because the alternative is fingerprinting.

There is also deliberately **no "known attack ports" preset**: checking your own
host for a backdoor port is legitimate and the custom field does it, but offering
it as one click against any address somebody types is a tool for finding other
people's compromised machines.

---

## A third state is not a detail

| State | Means |
| --- | --- |
| open | the handshake completed |
| closed | a reset came back — which took a reachable machine to send |
| filtered | nothing came back at all |

Most hosted checkers fold the last two together, and that is a false statement
about the network — one of the tools this was specified against prints `CLOSED`
with a `timeout` badge beside it.

Where a measurement has three outcomes, three is what the UI shows, and a scan
that comes back entirely filtered gets a sentence saying nothing answered rather
than being read as a clean bill of health.

---

## Concurrency is a politeness setting before it is a speed one

Opening every socket at once looks exactly like a SYN flood from the far end, and
that is how a server's address gets blocked by the networks it most needs to
reach.

**Sixteen at a time, 128 ports at most, and an absolute deadline that reports
whatever is unfinished as `filtered`** — because a serverless function killed at
its own limit returns nothing at all.

---

## Related

- [`../security.md`](../security.md) — the fail-closed doctrine, generalised.
- [`../patterns/outbound-requests.md`](../patterns/outbound-requests.md)
- [`../design-system.md`](../design-system.md#never-scroll-to-a-destination-that-can-turn-out-empty)
