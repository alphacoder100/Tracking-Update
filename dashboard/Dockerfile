FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3003

# Dev server reads NEXT_PUBLIC_* and server env at runtime (no build-time bake).
CMD ["npm", "run", "dev"]
