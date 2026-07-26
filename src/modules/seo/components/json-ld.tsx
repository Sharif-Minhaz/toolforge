type JsonLdProps = {
    data: Record<string, unknown>;
};

/**
 * Emits schema.org structured data. `<` is escaped so a translated string can
 * never break out of the script element.
 */
export function JsonLd({ data }: JsonLdProps) {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
                __html: JSON.stringify(data).replaceAll("<", "\\u003c"),
            }}
        />
    );
}
