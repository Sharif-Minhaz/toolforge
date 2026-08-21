/**
 * The two things a spreadsheet cell's raw value cannot say for itself: whether
 * the number in it is a date, and whether it is a percentage.
 *
 * Deliberately not a number-format engine. Excel's format codes are a small
 * language — conditional sections, colours, locale hints, literal text — and
 * implementing it would be a tool of its own. What is implemented here is the
 * part whose absence is *wrong* rather than merely plain: a date column that
 * prints `45678` has lost its meaning, and `0.15` where the sheet said `15%`
 * has changed it. Everything else prints as the number it is, which is honest.
 */

/** Excel's built-in format ids that mean a date, a time, or both. */
const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

const BUILT_IN_PERCENT_FORMATS = new Set([9, 10]);

/**
 * A custom format code with a date field in it.
 *
 * Literal text in quotes and the `[$-409]` locale prefixes are removed first,
 * or `"day"` would make every code containing the word look like a date.
 */
export function isDateFormatCode(code: string): boolean {
    const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");

    return /[ymdhs]/i.test(bare);
}

export function isDateFormat(numberFormatId: number, formatCode: string | null): boolean {
    if (BUILT_IN_DATE_FORMATS.has(numberFormatId)) {
        return true;
    }

    return formatCode !== null && isDateFormatCode(formatCode);
}

export function isPercentFormat(numberFormatId: number, formatCode: string | null): boolean {
    if (BUILT_IN_PERCENT_FORMATS.has(numberFormatId)) {
        return true;
    }

    return formatCode !== null && formatCode.replace(/"[^"]*"/g, "").includes("%");
}

/**
 * A serial number turned into `YYYY-MM-DD`, or `YYYY-MM-DD HH:MM` when it
 * carries a time.
 *
 * ISO order rather than the sheet's own format, and stated in the article. A
 * PDF is read by whoever it is sent to, and `03/04/2026` means two different
 * days depending on which side of an ocean it lands on; `2026-04-03` means one.
 *
 * The 1900 system counts from 1899-12-31 as day 1 **and** contains Lotus's
 * phantom 29 February 1900, so every serial above 59 is one greater than the
 * true day count. Subtracting from a 1899-12-30 epoch absorbs both, which is
 * why the constant is not the date it looks like it should be. Serials at or
 * below 60 are before the phantom day and are shifted back by one to
 * compensate. The 1904 system, which a workbook may ask for, has neither
 * problem.
 */
export function serialToDateParts(
    serial: number,
    date1904: boolean,
): { readonly date: string; readonly time: string | null } | null {
    if (!Number.isFinite(serial) || serial < 0) {
        return null;
    }

    const wholeDays = Math.floor(serial);
    const adjusted = date1904 ? wholeDays : wholeDays <= 60 ? wholeDays + 1 : wholeDays;
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const milliseconds = epoch + adjusted * 86_400_000;
    const moment = new Date(milliseconds);

    if (Number.isNaN(moment.getTime())) {
        return null;
    }

    const date = moment.toISOString().slice(0, 10);
    const fraction = serial - wholeDays;

    if (fraction <= 0) {
        return { date, time: null };
    }

    // Rounded to the minute rather than the second. A serial is a float, and
    // the last few bits of one are noise rather than a time — 09:30 stored as
    // 0.39583333 comes back as 09:29:59 if it is truncated.
    const totalMinutes = Math.round(fraction * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;

    return {
        date,
        time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    };
}

/**
 * A number written the way a person would read it back.
 *
 * `toString` on a float that came out of a spreadsheet is how `0.1 + 0.2`
 * reaches a report as `0.30000000000000004`. Twelve significant digits is past
 * anything a sheet stores deliberately and short of where doubles start lying.
 */
export function formatCellNumber(value: number): string {
    if (!Number.isFinite(value)) {
        return "";
    }

    if (Number.isInteger(value)) {
        return String(value);
    }

    return String(Number.parseFloat(value.toPrecision(12)));
}
