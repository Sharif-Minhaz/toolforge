"use client";

import { IconLoader2, IconWand } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { DEFAULT_JWT_ALGORITHM } from "../domain/constants";
import { createJwtExample, type JwtExample } from "../domain/examples";
import type { JwtAlgorithm } from "../types";
import { AlgorithmSelect } from "./algorithm-select";

type ExampleGeneratorProps = {
    onGenerate: (example: JwtExample) => void;
};

/**
 * Mints a token and, for the asymmetric families, a throwaway key pair. Without
 * it the RSA, ECDSA and EdDSA paths are unreachable for anyone who does not
 * already have a key to hand — and generating on demand means no private key
 * ships in the bundle or sits in the repository.
 */
export function ExampleGenerator({ onGenerate }: ExampleGeneratorProps) {
    const t = useTranslations("jwt.workbench");
    const labelId = useId();

    const [algorithm, setAlgorithm] = useState<JwtAlgorithm>(DEFAULT_JWT_ALGORITHM);
    const [pending, setPending] = useState(false);

    async function handleGenerate() {
        setPending(true);

        try {
            // The clock is read here, in an event handler, rather than during
            // render, where a fresh `Date` would break hydration.
            const result = await createJwtExample({ algorithm, issuedAt: new Date() });

            if (!result.ok) {
                toast.error(t("exampleFailed"));

                return;
            }

            onGenerate(result.example);
            toast.success(t("exampleReady", { algorithm }));
        } catch (caught) {
            logEvent("error", "jwt.example_failed", {
                algorithm,
                error: describeError(caught),
            });
            toast.error(t("exampleFailed"));
        } finally {
            setPending(false);
        }
    }

    return (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Label id={labelId} className="text-muted-foreground text-xs">
                <span className="leading-[1.3]">{t("exampleLabel")}</span>
            </Label>
            <AlgorithmSelect
                value={algorithm}
                onChange={setAlgorithm}
                labelledBy={labelId}
                className="w-32"
            />
            <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void handleGenerate()}
            >
                {pending ? (
                    <IconLoader2
                        className="size-3.5 animate-spin"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                ) : (
                    <IconWand className="size-3.5" stroke={1.9} aria-hidden="true" />
                )}
                {t("exampleAction")}
            </Button>
        </div>
    );
}
