FROM node:22-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y fuse3 openssl sqlite3 ca-certificates

COPY . .
RUN npm ci

ENV FLY="true"
ENV LITEFS_DIR="/app/data"
ENV DATABASE_FILENAME="sqlite.db"
ENV DATABASE_PATH="$LITEFS_DIR/$DATABASE_FILENAME"
ENV DATABASE_URL="file:$DATABASE_PATH"
ENV NODE_ENV="production"
# For WAL support: https://github.com/prisma/prisma-engines/issues/4675#issuecomment-1914383246
ENV PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = "1"
# add shortcut for connecting to database CLI
RUN echo "#!/bin/sh\nset -x\nsqlite3 \$DATABASE_URL" > /usr/local/bin/database-cli && chmod +x /usr/local/bin/database-cli
# and one for the cache database
RUN echo "#!/bin/sh\nset -x\nsqlite3 \$CACHE_DATABASE_URL" > /usr/local/bin/cache-database-cli && chmod +x /usr/local/bin/cache-database-cli


ENV NODE_ENV=production
CMD ["bash", "-c", "./scripts/start.sh"] 