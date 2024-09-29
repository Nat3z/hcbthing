FROM oven/bun:alpine

COPY package.json ./
COPY bun.lockb ./
COPY src ./src

RUN bun install --frozen-lockfile --production

CMD [ "bun", "start" ]
