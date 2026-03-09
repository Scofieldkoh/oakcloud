FROM node:20-alpine

WORKDIR /app

# Install dependencies for native modules and Chromium for PDF generation
RUN apk add --no-cache libc6-compat chromium
ENV CHROME_PATH=/usr/bin/chromium-browser

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy prisma schema for generation
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the app
COPY . .

# Expose port
EXPOSE 3000

# Start dev server
CMD ["npm", "run", "dev"]
