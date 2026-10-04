FROM node:24.19.0-alpine3.23

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY services/payment-api/package.json services/payment-api/package.json
COPY services/payment-worker/package.json services/payment-worker/package.json
COPY services/webhook-sink/package.json services/webhook-sink/package.json

RUN npm ci

COPY tsconfig.base.json vitest.config.ts ./
COPY packages packages
COPY services services

RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run generate --workspace @chaos/database

CMD ["npm", "run", "start", "--workspace", "@chaos/payment-api"]
