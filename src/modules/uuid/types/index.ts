export const UUID_VERSIONS = [1, 4, 7] as const;

export type UuidVersion = (typeof UUID_VERSIONS)[number];

export const UUID_EXPORT_FORMATS = ["txt", "csv", "json"] as const;

export type UuidExportFormat = (typeof UUID_EXPORT_FORMATS)[number];

export type UuidGenerationOptions = {
    readonly version: UuidVersion;
    readonly quantity: number;
};

export type UuidExportRequest = {
    readonly uuids: readonly string[];
    readonly version: UuidVersion;
    readonly format: UuidExportFormat;
    /** Injected so exports are deterministic in tests. */
    readonly generatedAt: Date;
};

export type DownloadFile = {
    readonly filename: string;
    readonly mimeType: string;
    readonly content: string;
};
