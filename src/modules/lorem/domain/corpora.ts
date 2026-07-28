import type { LoremSource } from "../types";

/**
 * The word pools the generator draws from.
 *
 * Every passage here is public domain. Labels are proper names — "Kafka",
 * "a-z A-Z 123", "বাংলা" — so they are data rather than copy and never enter
 * the message catalogue; the localised one-line description of each corpus
 * lives under `lorem.sources.<id>.tagline` instead.
 *
 * Three shapes cover every source:
 *
 * - `prose`   composes sentences from a word pool, the way lorem ipsum works.
 * - `phrases` emits whole sentences verbatim, because scrambling a pangram
 *             would stop it being one.
 * - `tokens`  joins random atoms into whitespace-separated runs, for sources
 *             that have no words at all.
 */

type CorpusBase = {
    /** Shown in the picker. A proper name, so it is never translated. */
    readonly label: string;
    /** BCP-47 tag, applied to the output so fonts and screen readers follow. */
    readonly lang: string;
};

export type LoremCorpus = CorpusBase &
    (
        | {
              readonly kind: "prose";
              /** Terminator appended to every sentence — a danda for Bangla. */
              readonly sentenceEnd: string;
              /** Whether the first letter of a sentence is uppercased. */
              readonly capitalize: boolean;
              /** Canonical opening words, used when the opener switch is on. */
              readonly opener: readonly string[];
              readonly words: readonly string[];
          }
        | { readonly kind: "phrases"; readonly phrases: readonly string[] }
        | {
              readonly kind: "tokens";
              readonly atoms: readonly string[];
              readonly minAtoms: number;
              readonly maxAtoms: number;
          }
    );

/**
 * Pools are written as prose and split on whitespace. One string per line
 * would be several hundred lines of noise, and the passage stays readable —
 * and checkable against the source — the way it is written here.
 */
function pool(source: string): readonly string[] {
    return source.trim().split(/\s+/);
}

const LOREM_WORDS = pool(`
    lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut
    labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris
    nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse
    cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui
    officia deserunt mollit anim id est laborum at vero eos accusamus iusto odio dignissimos
    ducimus blanditiis praesentium voluptatum deleniti atque corrupti quos dolores quas molestias
    excepturi occaecati provident similique mollitia animi dolorum fuga harum quidem rerum facilis
    expedita distinctio nam libero tempore cum soluta nobis eligendi optio cumque nihil impedit
    quo minus maxime placeat facere possimus omnis voluptas assumenda repellendus temporibus autem
    quibusdam officiis debitis necessitatibus saepe eveniet voluptates repudiandae recusandae
    itaque earum hic tenetur sapiente delectus reiciendis voluptatibus maiores alias perferendis
    doloribus asperiores repellat totam aperiam eaque ipsa quae ab illo inventore veritatis quasi
    architecto beatae vitae dicta explicabo
`);

const CICERO_WORDS = pool(`
    sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
    laudantium totam rem aperiam eaque ipsa quae ab illo inventore veritatis et quasi architecto
    beatae vitae dicta sunt explicabo nemo enim ipsam quia voluptas aspernatur aut odit fugit
    consequuntur magni dolores eos qui ratione sequi nesciunt neque porro quisquam est dolorem
    ipsum dolor amet consectetur adipisci velit non numquam eius modi tempora incidunt labore
    magnam aliquam quaerat autem vel eum iure reprehenderit in ea voluptate esse quam nihil
    molestiae consequatur illum fugiat quo nulla pariatur temporibus tenetur sapiente delectus
    reiciendis maiores alias perferendis doloribus asperiores repellat similique nam libero
    tempore cum soluta nobis eligendi optio cumque impedit minus id maxime placeat facere possimus
`);

// "I" stays capitalised in the pool: only the first letter of a sentence is
// uppercased, so a lowercase pronoun would survive into the middle of one.
const CICERO_EN_WORDS = pool(`
    but I must explain to you how all this mistaken idea of denouncing pleasure and praising pain
    was born will give a complete account the system expound actual teachings great explorer truth
    master-builder human happiness no one rejects dislikes or avoids itself because it is those
    who do not know pursue rationally encounter consequences that are extremely painful nor again
    there anyone loves seeks after desires obtain in some circumstances through toil and trouble
    take trivial example which us ever undertakes laborious physical exercise except advantage
    from has any right find fault with man chooses enjoy annoying produces resultant avoid results
    on other hand we denounce righteous indignation beguiled demoralized by charms moment so
    blinded desire they cannot foresee
`);

const EUROPAN_WORDS = pool(`
    li Europan lingues es membres del sam familie lor separat existentie un myth por scientie
    musica sport etc litot Europa usa vocabular differe solmen in grammatica pronunciation e plu
    commun vocabules omnicos directe al desirabilite de nov lingua franca on refusa continuar
    payar custosi traductores it va esser necessi far uniform sommun paroles ma quande coalesce
    resultant simplic regulari quam existent tam occidental fact
`);

const EUROPAN_EN_WORDS = pool(`
    the european languages are members of same family their separate existence is a myth for
    science music sport etc europe uses vocabulary only differ in grammar pronunciation and most
    common words everyone realizes why new language would be desirable one could refuse to pay
    expensive translators it will necessary have uniform as simple regular existing resulting at
    least you can say that if several coalesce more than individual ones which sounds like
    simplified english skeptical friend told me what occidental actually us
`);

const FAR_FAR_AWAY_WORDS = pool(`
    far away behind the word mountains from countries vokalia and consonantia there live blind
    texts separated they in bookmarksgrove right at coast of semantics a large language ocean
    small river named duden flows by their place supplies it with necessary regelialia is
    paradisematic country which roasted parts sentences fly into your mouth even all-powerful
    pointing has no control about almost unorthographic life one day however line lorem ipsum
    decided to leave for world grammar big oxmox advised her not do so because were thousands bad
    commas wild question marks devious semikoli but copy listen she packed seven versalia put
    initial belt made herself on way when reached first hills italic had last view back skyline
    hometown
`);

const WERTHER_WORDS = pool(`
    wie froh bin ich daß weg bester Freund was ist das Herz des Menschen dich zu verlassen den so
    liebe von dem unzertrennlich war und sein weiß du verzeihst mirs waren nicht meine übrigen
    Verbindungen recht vom Schicksal ausersucht um ein meines ängstigen die arme Leonore dennoch
    unschuldig konnte dafür als sich in meinem Herzen eine Leidenschaft bildete mich reizte doch
    ganz ohne Schuld habe Gefühl genährt über sonderbaren Äußerungen ihres Geistes gelacht gar
    lächerlich aber der Mensch will bessern mehr wenig Übel uns vorlegt wiederkäuen sondern
    Gegenwärtige genießen Vergangene soll vergangen
`);

const KAFKA_WORDS = pool(`
    als Gregor Samsa eines Morgens aus unruhigen Träumen erwachte fand er sich in seinem Bett zu
    einem ungeheueren Ungeziefer verwandelt lag auf panzerartig harten Rücken und sah wenn den
    Kopf ein wenig hob seinen gewölbten braunen von bogenförmigen Versteifungen geteilten Bauch
    dem die Bettdecke zum gänzlichen Niedergleiten bereit kaum noch erhalten konnte seine vielen
    im Vergleich sonstigen Umfang kläglich dünnen Beine flimmerten ihm hilflos vor Augen was ist
    mit mir geschehen dachte es kein Traum Zimmer richtiges nur etwas kleines Menschenzimmer ruhig
    zwischen vier wohlbekannten Wänden über Tisch auseinandergepackte Musterkollektion Tuchwaren
    aufgebreitet
`);

const BANGLA_WORDS = pool(`
    আমি তুমি সে আমরা তারা মন আকাশ নদী বাতাস আলো ছায়া দিন রাত সকাল সন্ধ্যা পথ গান কথা স্বপ্ন
    জীবন ভালোবাসা হৃদয় মেঘ বৃষ্টি ফুল পাতা গাছ মাঠ ঘর দূরে কাছে নীরব শান্ত অসীম নতুন পুরাতন
    সময় চোখ হাত পৃথিবী সমুদ্র পাহাড় বসন্ত শরৎ বর্ষা শীত সুর ছন্দ কবিতা ভাষা দেশ মানুষ শিশু
    বন্ধু আনন্দ বেদনা আশা সাহস সত্য সুন্দর অন্ধকার ভোর চাঁদ সূর্য পাখি ডানা স্মৃতি খেলা হাসি
    মধুর গভীর বিশাল ছোট বড় সবুজ স্নিগ্ধ চলে আসে যায় বলে শোনে দেখে ভাবে থাকে হয় করে দিয়ে
    নিয়ে তবু যেন আর এই সেই কোনো সব কিছু অনেক একটু মাঝে ভিতরে
`);

const PANGRAM_PHRASES = [
    "The quick brown fox jumps over the lazy dog.",
    "Pack my box with five dozen liquor jugs.",
    "How vexingly quick daft zebras jump!",
    "Sphinx of black quartz, judge my vow.",
    "The five boxing wizards jump quickly.",
    "Jackdaws love my big sphinx of quartz.",
    "Waltz, bad nymph, for quick jigs vex.",
    "Bright vixens jump; dozy fowl quack.",
    "Quick zephyrs blow, vexing daft Jim.",
    "Two driven jocks help fax my big quiz.",
    "Jinxed wizards pluck ivy from the big quilt.",
    "Amazingly few discotheques provide jukeboxes.",
];

const ALPHABET_ATOMS = [
    ..."abcdefghijklmnopqrstuvwxyz",
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ..."0123456789",
];

/**
 * Single code point each — no variation selectors, no skin-tone modifiers, no
 * ZWJ sequences. That keeps one emoji equal to one character everywhere the
 * generator counts, and stops a slice landing between the two halves of a
 * surrogate pair.
 */
const EMOJI_ATOMS = pool(`
    😀 😃 😄 😁 😆 😅 😂 😉 😊 😍 😘 😜 🤓 😎 🥳 🤔 😴 😱 🤯 🥶
    👍 👏 🙌 🤝 💪 🧠 👀 🦾 🫶 🤌 🐶 🐱 🦊 🐻 🐼 🦁 🐸 🐙 🦄 🦖
    🐝 🦋 🐢 🦉 🐧 🦜 🐳 🦈 🐬 🦕 🌱 🌵 🌲 🌸 🌻 🍀 🍁 🌈 🌙 🌞
    🍎 🍕 🍔 🍟 🍣 🍜 🍩 🍪 🍫 🍿 🥤 🥑 🥕 🍇 🍉 🍓 🥝 🍋 🍑 🥐
    🚀 🛸 🚂 🚲 🎡 🎢 🎉 🎈 🎁 🎯 🎲 🎸 🎧 🎬 🎨 💡 🔑 🔒 🧩 🧪
    🧭 📌 📎 💻 📱 💾 🔋 🧰 🔭 🧲 🪄 🪐 🧊 🛰 🧵 🪁 🧨 🎳 🏓 🪃
`);

export const LOREM_CORPORA: Record<LoremSource, LoremCorpus> = {
    lorem: {
        label: "Lorem ipsum",
        lang: "la",
        kind: "prose",
        sentenceEnd: ".",
        capitalize: true,
        opener: ["lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit"],
        words: LOREM_WORDS,
    },
    cicero: {
        label: "Cicero",
        lang: "la",
        kind: "prose",
        sentenceEnd: ".",
        capitalize: true,
        opener: ["sed", "ut", "perspiciatis", "unde", "omnis", "iste", "natus", "error"],
        words: CICERO_WORDS,
    },
    "cicero-en": {
        label: "Cicero (en)",
        lang: "en",
        kind: "prose",
        sentenceEnd: ".",
        capitalize: true,
        opener: ["but", "I", "must", "explain", "to", "you", "how", "all", "this", "mistaken"],
        words: CICERO_EN_WORDS,
    },
    europan: {
        label: "Li Europan lingues",
        lang: "ie",
        kind: "prose",
        sentenceEnd: ".",
        capitalize: true,
        opener: ["li", "Europan", "lingues", "es", "membres", "del", "sam", "familie"],
        words: EUROPAN_WORDS,
    },
    "europan-en": {
        label: "Li Europan lingues (en)",
        lang: "en",
        kind: "prose",
        sentenceEnd: ".",
        capitalize: true,
        opener: ["the", "european", "languages", "are", "members", "of", "the", "same", "family"],
        words: EUROPAN_EN_WORDS,
    },
    "far-far-away": {
        label: "Far far away",
        lang: "en",
        kind: "prose",
        sentenceEnd: ".",
        capitalize: true,
        opener: ["far", "far", "away", "behind", "the", "word", "mountains"],
        words: FAR_FAR_AWAY_WORDS,
    },
    werther: {
        label: "Werther",
        lang: "de",
        kind: "prose",
        sentenceEnd: ".",
        capitalize: true,
        opener: ["wie", "froh", "bin", "ich", "daß", "ich", "weg", "bin"],
        words: WERTHER_WORDS,
    },
    kafka: {
        label: "Kafka",
        lang: "de",
        kind: "prose",
        sentenceEnd: ".",
        capitalize: true,
        opener: ["als", "Gregor", "Samsa", "eines", "Morgens", "aus", "unruhigen", "Träumen"],
        words: KAFKA_WORDS,
    },
    bangla: {
        label: "বাংলা (bn)",
        lang: "bn",
        // Bangla closes a sentence with a danda and has no letter case at all.
        kind: "prose",
        sentenceEnd: "।",
        capitalize: false,
        opener: ["আমার", "মনের", "মাঝে", "যে", "গান", "বাজে"],
        words: BANGLA_WORDS,
    },
    pangram: {
        label: "Pangram",
        lang: "en",
        kind: "phrases",
        phrases: PANGRAM_PHRASES,
    },
    alphabet: {
        label: "a-z A-Z 123",
        lang: "en",
        kind: "tokens",
        atoms: ALPHABET_ATOMS,
        minAtoms: 3,
        maxAtoms: 10,
    },
    emoji: {
        label: "Emoji",
        lang: "en",
        kind: "tokens",
        atoms: EMOJI_ATOMS,
        minAtoms: 1,
        maxAtoms: 1,
    },
};

export function getCorpus(source: LoremSource): LoremCorpus {
    return LOREM_CORPORA[source];
}

export function getSourceLabel(source: LoremSource): string {
    return LOREM_CORPORA[source].label;
}

/**
 * Only a composed passage has an opening line to lead with. A pangram, an
 * alphabet run, and an emoji run have nothing to start from, so the switch
 * goes quiet rather than silently doing nothing.
 */
export function supportsOpener(source: LoremSource): boolean {
    return LOREM_CORPORA[source].kind === "prose";
}
