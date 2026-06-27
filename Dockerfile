FROM node:20-alpine

WORKDIR /app

# Install dependencies for native modules, Chromium for PDF generation, and
# LibreOffice for Word-to-PDF conversion in e-signing uploads.
RUN apk add --no-cache libc6-compat chromium libreoffice ttf-dejavu
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV LIBREOFFICE_PATH=/usr/bin/soffice

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy prisma schema for generation
COPY prisma ./prisma/

# Copy the rest of the app
COPY . .

# Build Next.js for production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npx prisma generate
RUN test -f src/generated/prisma/client.ts
RUN npx next build

# Expose port
EXPOSE 3000

# Start production server
ENV NODE_ENV=production
CMD ["npm", "run", "start"]
