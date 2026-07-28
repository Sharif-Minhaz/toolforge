/**
 * Terms the detector refuses to send upstream.
 *
 * The list is tuned for **precision, not coverage**, because the two failure
 * modes are not symmetric: a false positive locks a reader out of the tool with
 * no way to argue, while a missed swear word costs one model call. So a term
 * only earns a place here when it has no common innocent reading.
 *
 * Deliberately left out, and why:
 *
 * - `ass`, `arse` — a donkey, and half of Chaucer.
 * - `dick`, `randy` — given names.
 * - `cock` — a rooster; `cockpit`, `cocktail`, `shuttlecock` are separate
 *   tokens, but the bare word still reads innocently.
 * - `fag` — a cigarette in British English.
 * - `chink` — a chink in the armour.
 * - `spic` — spick and span.
 * - `cum` — `cum laude`, and `bedroom-cum-study`.
 * - `prick`, `screw`, `shag`, `knob`, `gash` — ordinary verbs and nouns.
 * - `damn`, `hell`, `crap`, `bloody` — mild enough that blocking them would
 *   reject ordinary prose.
 *
 * Inflections are spelled out rather than stemmed: stemming turns `classic`
 * into a match for `class` soon enough, and an explicit list is something a
 * maintainer can read and argue with.
 *
 * Matching is case-insensitive and sees through spacing, punctuation, leetspeak
 * and repeated letters — see `profanity.ts`. Entries are therefore written in
 * their plain form.
 */
export const BLOCKED_WORDS: readonly string[] = [
    // English — sexual and scatological
    "fuck",
    "fucks",
    "fucked",
    "fucking",
    "fucker",
    "fuckers",
    "motherfucker",
    "motherfuckers",
    "motherfucking",
    "clusterfuck",
    "shit",
    "shits",
    "shitty",
    "shitting",
    "bullshit",
    "dogshit",
    "horseshit",
    "asshole",
    "assholes",
    "arsehole",
    "arseholes",
    "dumbass",
    "jackass",
    "dickhead",
    "dickheads",
    "cunt",
    "cunts",
    "twat",
    "twats",
    "wanker",
    "wankers",
    "bollocks",
    "bitch",
    "bitches",
    "bitching",
    "bastard",
    "bastards",
    "whore",
    "whores",
    "slut",
    "sluts",
    "pussy",
    "tits",
    "titties",
    "cocksucker",
    "cocksuckers",
    "blowjob",
    "blowjobs",
    "handjob",
    "handjobs",
    "jerkoff",
    "jizz",
    "cumshot",
    "creampie",
    "gangbang",
    "bukkake",
    "hentai",
    "porn",
    "porno",
    "pornography",
    // English — slurs
    "nigger",
    "niggers",
    "nigga",
    "niggas",
    "faggot",
    "faggots",
    "kike",
    "kikes",
    "gook",
    "gooks",
    "wetback",
    "wetbacks",
    "tranny",
    "trannies",
    "paki",
    "pakis",
    "coon",
    "coons",
    "retard",
    "retards",
    "retarded",
    // Bangla — Bengali script
    "চোদা",
    "চোদন",
    "চুদি",
    "চুদির",
    "চুদা",
    "খানকি",
    "খানকির",
    "মাগি",
    "মাগীর",
    "বেশ্যা",
    "রেন্ডি",
    "ভোদা",
    "হারামজাদা",
    "হারামজাদি",
    "কুত্তার",
    "শুয়োরের",
    // Bangla — as typed on a Latin keyboard
    "choda",
    "chuda",
    "chudi",
    "chudir",
    "khanki",
    "khankir",
    "magi",
    "magir",
    "beshya",
    "rendi",
    "voda",
    "haramjada",
    "haramjadi",
    "kuttar",
];
