/**
 * The fake-data providers the Response Builder offers, as data.
 *
 * A curated union rather than the whole Faker surface, for two reasons that
 * both matter. Faker exposes several hundred functions across modules that
 * shift between major versions, and a dropdown of several hundred is not a
 * choice a person can make. More importantly the ids have to be a **literal
 * union**, because each one becomes the message key `mockServer.faker.<id>` in
 * both locales — a plain `string` would defeat the type checking that keeps the
 * two catalogues in step, which is the rule `CLAUDE.md` states outright.
 *
 * **No `@faker-js/faker` import here, and there must never be one.** This file
 * is reached from `domain/`, which the client bundle can pull in; the package is
 * about three megabytes. What the registry holds is the id, its category and
 * what it produces. The call itself is injected into `ExecutionContext` by a
 * server-only module, exactly as `clock` and `random` are.
 *
 * Ids are camelCase and carry no dots, because a dot is next-intl's namespace
 * separator and `faker.person.fullName` would read as three nested keys.
 */

export const FAKER_CATEGORIES = [
    "person",
    "internet",
    "location",
    "company",
    "commerce",
    "finance",
    "text",
    "numbers",
    "dates",
    "identifiers",
] as const;

export type FakerCategory = (typeof FAKER_CATEGORIES)[number];

/** What a provider returns, so the tree editor can show the right badge. */
export type FakerOutput = "string" | "number" | "boolean";

export type FakerProvider = {
    readonly id: FakerFnId;
    readonly category: FakerCategory;
    readonly output: FakerOutput;
    /**
     * The dotted path into Faker's own API. Read only by the server-only
     * adapter, and kept here so the mapping lives beside the id it belongs to
     * rather than in a second table that can drift out of step.
     */
    readonly source: string;
};

export const FAKER_FN_IDS = [
    // person
    "personFullName",
    "personFirstName",
    "personLastName",
    "personJobTitle",
    "personBio",
    // internet
    "internetEmail",
    "internetUserName",
    "internetUrl",
    "internetDomainName",
    "internetIpv4",
    "internetIpv6",
    "internetMac",
    "internetPassword",
    "internetAvatar",
    "internetUserAgent",
    "phoneNumber",
    // location
    "locationCity",
    "locationCountry",
    "locationCountryCode",
    "locationStreetAddress",
    "locationZipCode",
    "locationLatitude",
    "locationLongitude",
    "locationTimeZone",
    // company
    "companyName",
    "companyCatchPhrase",
    // commerce
    "commerceProductName",
    "commerceProductDescription",
    "commerceDepartment",
    "commercePrice",
    // finance
    "financeAmount",
    "financeCurrencyCode",
    "financeIban",
    "financeCreditCardNumber",
    // text
    "loremWord",
    "loremWords",
    "loremSentence",
    "loremParagraph",
    "loremSlug",
    // numbers
    "numberInt",
    "numberFloat",
    "datatypeBoolean",
    // dates
    "datePast",
    "dateFuture",
    "dateRecent",
    "dateBirthdate",
    // identifiers
    "stringNanoid",
    "stringAlphanumeric",
    "databaseMongodbObjectId",
    "imageUrl",
    "colorRgb",
] as const;

export type FakerFnId = (typeof FAKER_FN_IDS)[number];

export const FAKER_PROVIDERS: readonly FakerProvider[] = [
    { id: "personFullName", category: "person", output: "string", source: "person.fullName" },
    { id: "personFirstName", category: "person", output: "string", source: "person.firstName" },
    { id: "personLastName", category: "person", output: "string", source: "person.lastName" },
    { id: "personJobTitle", category: "person", output: "string", source: "person.jobTitle" },
    { id: "personBio", category: "person", output: "string", source: "person.bio" },

    { id: "internetEmail", category: "internet", output: "string", source: "internet.email" },
    { id: "internetUserName", category: "internet", output: "string", source: "internet.username" },
    { id: "internetUrl", category: "internet", output: "string", source: "internet.url" },
    {
        id: "internetDomainName",
        category: "internet",
        output: "string",
        source: "internet.domainName",
    },
    { id: "internetIpv4", category: "internet", output: "string", source: "internet.ipv4" },
    { id: "internetIpv6", category: "internet", output: "string", source: "internet.ipv6" },
    { id: "internetMac", category: "internet", output: "string", source: "internet.mac" },
    { id: "internetPassword", category: "internet", output: "string", source: "internet.password" },
    { id: "internetAvatar", category: "internet", output: "string", source: "image.avatar" },
    {
        id: "internetUserAgent",
        category: "internet",
        output: "string",
        source: "internet.userAgent",
    },
    { id: "phoneNumber", category: "internet", output: "string", source: "phone.number" },

    { id: "locationCity", category: "location", output: "string", source: "location.city" },
    { id: "locationCountry", category: "location", output: "string", source: "location.country" },
    {
        id: "locationCountryCode",
        category: "location",
        output: "string",
        source: "location.countryCode",
    },
    {
        id: "locationStreetAddress",
        category: "location",
        output: "string",
        source: "location.streetAddress",
    },
    { id: "locationZipCode", category: "location", output: "string", source: "location.zipCode" },
    { id: "locationLatitude", category: "location", output: "number", source: "location.latitude" },
    {
        id: "locationLongitude",
        category: "location",
        output: "number",
        source: "location.longitude",
    },
    { id: "locationTimeZone", category: "location", output: "string", source: "location.timeZone" },

    { id: "companyName", category: "company", output: "string", source: "company.name" },
    {
        id: "companyCatchPhrase",
        category: "company",
        output: "string",
        source: "company.catchPhrase",
    },

    {
        id: "commerceProductName",
        category: "commerce",
        output: "string",
        source: "commerce.productName",
    },
    {
        id: "commerceProductDescription",
        category: "commerce",
        output: "string",
        source: "commerce.productDescription",
    },
    {
        id: "commerceDepartment",
        category: "commerce",
        output: "string",
        source: "commerce.department",
    },
    { id: "commercePrice", category: "commerce", output: "string", source: "commerce.price" },

    { id: "financeAmount", category: "finance", output: "string", source: "finance.amount" },
    {
        id: "financeCurrencyCode",
        category: "finance",
        output: "string",
        source: "finance.currencyCode",
    },
    { id: "financeIban", category: "finance", output: "string", source: "finance.iban" },
    {
        id: "financeCreditCardNumber",
        category: "finance",
        output: "string",
        source: "finance.creditCardNumber",
    },

    { id: "loremWord", category: "text", output: "string", source: "lorem.word" },
    { id: "loremWords", category: "text", output: "string", source: "lorem.words" },
    { id: "loremSentence", category: "text", output: "string", source: "lorem.sentence" },
    { id: "loremParagraph", category: "text", output: "string", source: "lorem.paragraph" },
    { id: "loremSlug", category: "text", output: "string", source: "lorem.slug" },

    { id: "numberInt", category: "numbers", output: "number", source: "number.int" },
    { id: "numberFloat", category: "numbers", output: "number", source: "number.float" },
    { id: "datatypeBoolean", category: "numbers", output: "boolean", source: "datatype.boolean" },

    { id: "datePast", category: "dates", output: "string", source: "date.past" },
    { id: "dateFuture", category: "dates", output: "string", source: "date.future" },
    { id: "dateRecent", category: "dates", output: "string", source: "date.recent" },
    { id: "dateBirthdate", category: "dates", output: "string", source: "date.birthdate" },

    { id: "stringNanoid", category: "identifiers", output: "string", source: "string.nanoid" },
    {
        id: "stringAlphanumeric",
        category: "identifiers",
        output: "string",
        source: "string.alphanumeric",
    },
    {
        id: "databaseMongodbObjectId",
        category: "identifiers",
        output: "string",
        source: "database.mongodbObjectId",
    },
    { id: "imageUrl", category: "identifiers", output: "string", source: "image.url" },
    { id: "colorRgb", category: "identifiers", output: "string", source: "color.rgb" },
];

const BY_ID = new Map(FAKER_PROVIDERS.map((provider) => [provider.id, provider]));

export function findFakerProvider(id: string): FakerProvider | undefined {
    return BY_ID.get(id as FakerFnId);
}

export function isFakerFnId(value: string): value is FakerFnId {
    return BY_ID.has(value as FakerFnId);
}

export function fakerProvidersByCategory(category: FakerCategory): readonly FakerProvider[] {
    return FAKER_PROVIDERS.filter((provider) => provider.category === category);
}
