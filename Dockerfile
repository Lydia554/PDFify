FROM node:20-slim

# Puppeteer dependencies + fonts
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-noto-color-emoji \
    fonts-noto \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    ghostscript \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Only copy package.json and package-lock.json first to cache layers
COPY ./app/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your app
COPY ./app .

# 👇 Add this to include your pdfa_def.ps file explicitly
COPY ./app/server/routes/pdfa_def.ps /app/pdfa_def.ps

CMD ["node", "server/index.js"]
