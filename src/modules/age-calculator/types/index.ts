import type { CivilDate, HijriDate } from "@/modules/tools/types";

/**
 * A plain calendar date and its Hijri counterpart live in the shared layer
 * since the Zakat Calculator's hawl needed them too; re-exported so this
 * module's many imports read as they always have.
 */
export type { CivilDate, HijriDate };

/** A proleptic Gregorian date. Months and days count from 1. */

/** The two workbench modes: an age on a date, or one date in three calendars. */
export const AGE_MODES = ["age", "convert"] as const;

export type AgeMode = (typeof AGE_MODES)[number];

/** The calendars a date can be entered in on the convert side. */
export const CALENDARS = ["gregorian", "bangla", "hijri"] as const;

export type CalendarId = (typeof CALENDARS)[number];

/**
 * Which revision of Bangladesh's Bangla calendar fixed the month lengths.
 *
 * `2019` is the one in force since 1426 BS: Boishakh to Ashwin 31 days, Falgun
 * 29 (30 in a leap year), the rest 30. `1987` is the Shahidullah calendar
 * adopted in 1394 BS: Boishakh to Bhadro 31 days, Falgun 30 (31 in a leap
 * year), the rest 30. Both pin 1 Boishakh to 14 April.
 */
export const BANGLA_RULES = ["2019", "1987"] as const;

export type BanglaRule = (typeof BANGLA_RULES)[number];

/** Month keys, in calendar order — they build message keys, so they stay a literal tuple. */
export const BANGLA_MONTHS = [
    "boishakh",
    "jyoishtho",
    "asharh",
    "srabon",
    "bhadro",
    "ashwin",
    "kartik",
    "agrahayan",
    "poush",
    "magh",
    "falgun",
    "chaitra",
] as const;

export type BanglaMonth = (typeof BANGLA_MONTHS)[number];

export const HIJRI_MONTHS = [
    "muharram",
    "safar",
    "rabiAwwal",
    "rabiThani",
    "jumadaUla",
    "jumadaAkhirah",
    "rajab",
    "shaban",
    "ramadan",
    "shawwal",
    "dhulQadah",
    "dhulHijjah",
] as const;

export type HijriMonth = (typeof HIJRI_MONTHS)[number];

/**
 * Gregorian month and weekday names come from the catalogue rather than from
 * `Intl`: CLDR's Bangla spellings have changed between versions (জানুয়ারী /
 * জানুয়ারি), and a server and a browser on different ICU data would render
 * different text on each side of hydration.
 */
export const GREGORIAN_MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
] as const;

export type GregorianMonth = (typeof GREGORIAN_MONTHS)[number];

/** 0 = Sunday, the numbering `getWeekday` returns. */
export const WEEKDAYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type BanglaDate = {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    /** The revision whose month lengths produced this date. */
    readonly rule: BanglaRule;
    /**
     * Before 1394 BS, when no fixed calendar was official and the almanac
     * (panjika) set the months astronomically. The 1987 lengths are applied
     * backwards, and the reader is told the almanac may differ by a day.
     */
    readonly beforeReform: boolean;
};

/** One day as all three calendars name it. */
export type DateFacts = {
    readonly gregorian: CivilDate;
    /** `YYYY-MM-DD`, the form a link and a machine read. */
    readonly iso: string;
    /** 0 = Sunday through 6 = Saturday. */
    readonly weekday: number;
    readonly bangla: BanglaDate;
    readonly hijri: HijriDate;
};

/** Why a typed date was not a date. Each keeps its own message beside its field. */
export type DateInputFailure = "empty" | "invalid_format" | "invalid_date" | "out_of_range";

export type DateInputResult =
    | { readonly ok: true; readonly date: CivilDate }
    | { readonly ok: false; readonly reason: DateInputFailure };

/** An elapsed span the way a form asks for it: completed years, months, then days. */
export type AgeSpan = {
    readonly years: number;
    readonly months: number;
    readonly days: number;
};

export type AgeTotals = {
    readonly months: number;
    readonly weeks: number;
    /** Days left over after the whole weeks. */
    readonly weekDays: number;
    readonly days: number;
};

export type NextBirthday = {
    readonly date: CivilDate;
    /** 0 on the birthday itself. */
    readonly daysUntil: number;
    /** The age that birthday completes. */
    readonly turning: number;
};

/** An age limit from a job circular. `null` leaves that side unchecked. */
export type AgeLimits = {
    readonly minYears: number | null;
    readonly maxYears: number | null;
};

/**
 * One side of a limit. `born` is the date of birth on the edge: the latest one
 * old enough for a minimum, the earliest one young enough for a maximum.
 */
export type LimitCheck = {
    readonly years: number;
    readonly passes: boolean;
    readonly born: CivilDate;
};

export type Eligibility = {
    readonly eligible: boolean;
    readonly min: LimitCheck | null;
    /** The maximum on the circular's own cut-off date. */
    readonly max: LimitCheck | null;
    /**
     * The maximum again on a relaxation date — the COVID-19 notices counted
     * age as of 25 March 2020. Passing either one passes the maximum.
     */
    readonly relaxedMax: LimitCheck | null;
    /** Only set when the reader is ineligible on the main date and eligible here. */
    readonly passedByRelaxation: boolean;
};

export type EligibilityFailureReason = "min_above_max" | "limit_out_of_range";

export type AgeFailureReason =
    | "invalid_birth"
    | "invalid_reference"
    | "invalid_relaxation"
    | "birth_after_reference"
    | EligibilityFailureReason;

export type AgeFailure = {
    readonly ok: false;
    readonly reason: AgeFailureReason;
    /** Why the date was not read, for the three `invalid_*` reasons. */
    readonly dateReason?: DateInputFailure;
};

export type AgeSuccess = {
    readonly ok: true;
    readonly age: AgeSpan;
    readonly totals: AgeTotals;
    readonly birth: DateFacts;
    readonly reference: DateFacts;
    readonly nextBirthday: NextBirthday;
    /** `null` when no limit was asked about. */
    readonly eligibility: Eligibility | null;
    /** The relaxation date as read, when one was given. */
    readonly relaxation: DateFacts | null;
};

export type AgeResult = AgeSuccess | AgeFailure;

/** What the age orchestrator reads. Dates are text exactly as typed. */
export type AgeRequest = {
    readonly birth: string;
    readonly reference: string;
    readonly limits: AgeLimits;
    /** `""` for no relaxation date. */
    readonly relaxation: string;
    readonly hijriAdjustment: number;
};

/** A date in one calendar, field by field, as the convert side's three controls hold it. */
export type CalendarFields = {
    readonly calendar: CalendarId;
    readonly year: number;
    readonly month: number;
    readonly day: number;
};

export type ConvertFailureReason = "invalid_date" | "out_of_range";

export type ConvertResult =
    | { readonly ok: true; readonly facts: DateFacts }
    | { readonly ok: false; readonly reason: ConvertFailureReason };

/** Everything the age side holds as typed text, in one object so it settles as one. */
export type AgeFields = {
    readonly birth: string;
    readonly reference: string;
    readonly min: string;
    readonly max: string;
    readonly relaxation: string;
};

/** The convert side as typed: the day and year are text, the calendar and month are picked. */
export type ConvertFields = {
    readonly calendar: CalendarId;
    readonly day: string;
    readonly month: number;
    readonly year: string;
};

/** What the page hands the island, built on the server from the URL and today's date. */
export type InitialWorkbenchState = {
    readonly mode: AgeMode;
    readonly ageFields: AgeFields;
    readonly convertFields: ConvertFields;
    readonly hijriAdjustment: number;
};
