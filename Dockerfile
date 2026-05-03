FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl postgresql-client && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY scripts ./scripts
COPY tests ./tests
RUN npm run build

EXPOSE 4000

CMD ["npm", "run", "start"]
