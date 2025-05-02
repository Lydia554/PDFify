FROM node:20-slim

# Puppeteer dependencies
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
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
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

    WORKDIR /app

    # Only copy package.json and package-lock.json first to cache layers
    COPY package*.json ./
    
    # Install dependencies inside container (ensures correct platform)
    RUN npm install
    
    # Then copy your code
    COPY . .
    
    CMD ["node", "server/index.js"]
