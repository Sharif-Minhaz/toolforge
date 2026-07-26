import type { UuidGenerationOptions, UuidVersion } from "../types";
import { MAX_UUID_QUANTITY, MIN_UUID_QUANTITY } from "./constants";

/**
 * RFC 9562 UUID generation, implemented on top of the Web Crypto API so the
 * exact same code path runs on the server and in the browser. No value ever
 * leaves the machine that generated it.
 */

const HEX_OCTETS: readonly string[] = Array.from({ length: 256 }, (_, byte) =>
    byte.toString(16).padStart(2, "0"),
);

/** 100-nanosecond intervals between 1582-10-15 (Gregorian epoch) and 1970-01-01. */
const GREGORIAN_OFFSET = 0x01b21dd213814000n;

const INTERVALS_PER_MILLISECOND = 10_000n;

/** 12-bit `rand_a` field of a v7 UUID, reused as a monotonic counter. */
const V7_COUNTER_MAX = 0x0fff;

/**
 * Counter headroom reserved when reseeding, so a full batch can be emitted
 * inside a single millisecond without overflowing.
 */
const V7_COUNTER_HEADROOM = MAX_UUID_QUANTITY + 1;

export class UuidQuantityError extends Error {
    readonly code = "invalid_quantity";

    constructor(readonly quantity: number) {
        super(
            `Quantity must be an integer between ${MIN_UUID_QUANTITY} and ${MAX_UUID_QUANTITY}, received ${quantity}.`,
        );
        this.name = "UuidQuantityError";
    }
}

function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);

    return bytes;
}

function randomInteger(exclusiveMax: number): number {
    const [high, low] = randomBytes(2);

    return ((high << 8) | low) % exclusiveMax;
}

function formatUuid(bytes: Uint8Array): string {
    let out = "";

    for (let index = 0; index < 16; index += 1) {
        if (index === 4 || index === 6 || index === 8 || index === 10) {
            out += "-";
        }
        out += HEX_OCTETS[bytes[index]];
    }

    return out;
}

/** Stamps the RFC 9562 version nibble and the `10xx` variant bits in place. */
function applyVersionAndVariant(bytes: Uint8Array, version: UuidVersion): void {
    bytes[6] = (bytes[6] & 0x0f) | (version << 4);
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
}

/* ------------------------------------------------------------------ v1 --- */

type V1State = {
    /** 14-bit clock sequence, re-randomised whenever the clock goes backwards. */
    clockSequence: number;
    /** 48-bit node id with the multicast bit set, per RFC 9562 §5.1. */
    node: Uint8Array;
    lastMilliseconds: number;
    /** Sub-millisecond 100ns ticks, keeps timestamps unique within one tick. */
    subTicks: bigint;
};

function createV1State(): V1State {
    const node = randomBytes(6);
    node[0] |= 0x01;

    return {
        clockSequence: randomInteger(0x4000),
        node,
        lastMilliseconds: -1,
        subTicks: 0n,
    };
}

const v1State = createV1State();

function generateV1(state: V1State, milliseconds: number): string {
    if (milliseconds === state.lastMilliseconds) {
        state.subTicks += 1n;

        // Ran out of 100ns slots inside this millisecond — borrow from the next.
        if (state.subTicks >= INTERVALS_PER_MILLISECOND) {
            state.subTicks = 0n;
            state.lastMilliseconds += 1;
        }
    } else {
        if (milliseconds < state.lastMilliseconds) {
            state.clockSequence = (state.clockSequence + 1) & 0x3fff;
        }
        state.lastMilliseconds = milliseconds;
        state.subTicks = 0n;
    }

    const timestamp =
        BigInt(state.lastMilliseconds) * INTERVALS_PER_MILLISECOND +
        state.subTicks +
        GREGORIAN_OFFSET;

    const timeLow = Number(timestamp & 0xffffffffn);
    const timeMid = Number((timestamp >> 32n) & 0xffffn);
    const timeHighAndVersion = Number((timestamp >> 48n) & 0x0fffn) | 0x1000;

    const bytes = new Uint8Array(16);
    bytes[0] = (timeLow >>> 24) & 0xff;
    bytes[1] = (timeLow >>> 16) & 0xff;
    bytes[2] = (timeLow >>> 8) & 0xff;
    bytes[3] = timeLow & 0xff;
    bytes[4] = (timeMid >>> 8) & 0xff;
    bytes[5] = timeMid & 0xff;
    bytes[6] = (timeHighAndVersion >>> 8) & 0xff;
    bytes[7] = timeHighAndVersion & 0xff;
    bytes[8] = ((state.clockSequence >>> 8) & 0x3f) | 0x80;
    bytes[9] = state.clockSequence & 0xff;
    bytes.set(state.node, 10);

    return formatUuid(bytes);
}

/* ------------------------------------------------------------------ v4 --- */

function generateV4(): string {
    const bytes = randomBytes(16);
    applyVersionAndVariant(bytes, 4);

    return formatUuid(bytes);
}

/* ------------------------------------------------------------------ v7 --- */

type V7State = {
    lastMilliseconds: number;
    counter: number;
};

const v7State: V7State = { lastMilliseconds: -1, counter: 0 };

/**
 * v7 keeps its 48-bit Unix timestamp in the high bits, which makes the ids
 * sort chronologically. `rand_a` is used as a dedicated counter (RFC 9562
 * §6.2, method 1) so ids minted inside the same millisecond stay ordered.
 */
function generateV7(state: V7State, milliseconds: number): string {
    if (milliseconds === state.lastMilliseconds) {
        state.counter += 1;

        if (state.counter > V7_COUNTER_MAX) {
            state.lastMilliseconds += 1;
            state.counter = randomInteger(V7_COUNTER_MAX - V7_COUNTER_HEADROOM);
        }
    } else {
        state.lastMilliseconds = Math.max(milliseconds, state.lastMilliseconds);
        state.counter = randomInteger(V7_COUNTER_MAX - V7_COUNTER_HEADROOM);
    }

    const timestamp = BigInt(state.lastMilliseconds);
    const bytes = randomBytes(16);

    bytes[0] = Number((timestamp >> 40n) & 0xffn);
    bytes[1] = Number((timestamp >> 32n) & 0xffn);
    bytes[2] = Number((timestamp >> 24n) & 0xffn);
    bytes[3] = Number((timestamp >> 16n) & 0xffn);
    bytes[4] = Number((timestamp >> 8n) & 0xffn);
    bytes[5] = Number(timestamp & 0xffn);
    bytes[6] = (state.counter >>> 8) & 0x0f;
    bytes[7] = state.counter & 0xff;

    applyVersionAndVariant(bytes, 7);

    return formatUuid(bytes);
}

/* -------------------------------------------------------------- public --- */

export function generateUuid(version: UuidVersion, now: number = Date.now()): string {
    switch (version) {
        case 1:
            return generateV1(v1State, now);
        case 7:
            return generateV7(v7State, now);
        case 4:
        default:
            return generateV4();
    }
}

export function isValidQuantity(quantity: number): boolean {
    return (
        Number.isInteger(quantity) && quantity >= MIN_UUID_QUANTITY && quantity <= MAX_UUID_QUANTITY
    );
}

/**
 * Generates a batch of UUIDs.
 *
 * @throws {UuidQuantityError} when the quantity falls outside the supported range.
 */
export function generateUuids(options: UuidGenerationOptions): string[] {
    const { version, quantity } = options;

    if (!isValidQuantity(quantity)) {
        throw new UuidQuantityError(quantity);
    }

    const uuids = new Array<string>(quantity);

    for (let index = 0; index < quantity; index += 1) {
        uuids[index] = generateUuid(version);
    }

    return uuids;
}

/** Reads the version nibble out of a canonical UUID string. */
export function readUuidVersion(uuid: string): number {
    return Number.parseInt(uuid[14], 16);
}

/** Reads the two most significant bits of the variant octet. */
export function readUuidVariant(uuid: string): number {
    return Number.parseInt(uuid[19], 16) >>> 2;
}
