import type { AgeLimits, AgeMode, CalendarId } from "../types";

/**
 * The span of Gregorian years every calendar here is checked against. Wide
 * enough for anybody alive and any circular's cut-off date; narrow enough that
 * a typo like `1/1/198` is refused rather than read as the year 198.
 */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

/** The highest age limit a circular could plausibly name. */
export const MAX_LIMIT_YEARS = 99;

/**
 * A date is a short identity field, so the box is capped: `31/12/2026` is ten
 * characters, and twenty-four leaves room for spaces and a Bangla-digit paste
 * without admitting a paragraph.
 */
export const MAX_DATE_INPUT_LENGTH = 24;

/** How far the Hijri date can be shifted to match a local moon sighting. */
export const MAX_HIJRI_ADJUSTMENT = 2;

/**
 * Bangladesh's own clock. "Today" is the date in Dhaka, because the circulars
 * this tool exists for count their cut-off dates there, wherever the reader is.
 */
export const REFERENCE_TIME_ZONE = "Asia/Dhaka";

/** The first year each revision of the Bangla calendar was in force. */
export const BANGLA_2019_FIRST_YEAR = 1426;
export const BANGLA_1987_FIRST_YEAR = 1394;

/**
 * The cut-off date the 2020 COVID-19 relaxation notices named: age was to be
 * counted as of 25 March 2020 for circulars published under them.
 */
export const COVID_RELAXATION_DATE = "25/03/2020";

export const DEFAULT_MODE: AgeMode = "age";
export const DEFAULT_CONVERT_CALENDAR: CalendarId = "gregorian";
export const DEFAULT_HIJRI_ADJUSTMENT = 0;

export const NO_LIMITS: AgeLimits = { minYears: null, maxYears: null };

/** One-tap limits, the ones Bangladesh circulars ask for most. */
export const MIN_LIMIT_PRESETS: readonly number[] = [18, 21];
export const MAX_LIMIT_PRESETS: readonly number[] = [30, 32, 35];
