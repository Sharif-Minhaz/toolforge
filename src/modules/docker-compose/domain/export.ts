import type { DownloadFile } from "@/modules/tools/types";
import type { DockerComposeDirection } from "../types";
import { MIME_TYPE } from "./constants";

/**
 * `compose.yaml` is the name `docker compose` looks for on its own, so the
 * download is usable where it lands without a `-f`.
 */
export function createDockerComposeExportFile(
    direction: DockerComposeDirection,
    content: string,
): DownloadFile {
    return direction === "runToCompose"
        ? { filename: "compose.yaml", mimeType: MIME_TYPE.compose, content }
        : {
              filename: "docker-run.sh",
              mimeType: MIME_TYPE.run,
              content: `#!/bin/sh\n${content}\n`,
          };
}
