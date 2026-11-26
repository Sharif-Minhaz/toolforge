import type { DockerComposeDirection } from "../types";

export const DEFAULT_DIRECTION: DockerComposeDirection = "runToCompose";

/**
 * Longest input either reader accepts. A compose file for a large stack is a
 * few hundred lines; this is far past any real one and still a linear scan.
 */
export const MAX_INPUT_LENGTH = 100_000;

/** Longest `?input=` value accepted from a shared link. */
export const MAX_SHARED_INPUT_LENGTH = 4096;

/** Aliases a YAML document may expand before it is refused — the billion-laughs guard. */
export const MAX_YAML_ALIASES = 100;

export const SAMPLE_RUN = `docker run -d \\
  --name web \\
  --restart unless-stopped \\
  -p 8080:80 \\
  -v ./site:/usr/share/nginx/html:ro \\
  -e NGINX_HOST=example.com \\
  --network app \\
  --health-cmd 'curl -f http://localhost/ || exit 1' \\
  --health-interval 30s \\
  --rm \\
  nginx:1.27

docker run -d --name db --network app \\
  -e POSTGRES_PASSWORD='pa$$word' \\
  -v pgdata:/var/lib/postgresql/data \\
  postgres:16`;

export const SAMPLE_COMPOSE = `services:
  web:
    image: nginx:1.27
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./site:/usr/share/nginx/html:ro
    environment:
      NGINX_HOST: example.com
    depends_on:
      - db
  db:
    image: postgres:\${POSTGRES_TAG:-16}
    environment:
      - POSTGRES_PASSWORD=pa$$$$word
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 10s
volumes:
  pgdata:
`;

export const MIME_TYPE = {
    compose: "application/yaml;charset=utf-8",
    run: "text/x-shellscript;charset=utf-8",
} as const;
