FROM node:20-slim

# Puppeteer dependencies + fonts + Ghostscript + Java
RUN apt-get update && apt-get install -y \
    openjdk-17-jdk \
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

# Copy package.json first for caching
COPY ./app/package*.json ./

# Install Node dependencies
RUN npm install

# Copy app code
COPY ./app ./

# Copy ICC profile
COPY ./app/server/Helpers/sRGB_v4_ICC_preference.icc ./server/Helpers/sRGB_v4_ICC_preference.icc

# Copy PDFBox jar into container individually to avoid folder issues
COPY ./app/lib/preflight-app-3.0.6.jar ./lib/preflight-app-3.0.6.jar
RUN chmod 644 ./lib/preflight-app-3.0.6.jar

# Copy PDF/A definition file
COPY ./app/server/routes/pdfa_def.ps ./pdfa_def.ps

CMD ["node", "server/index.js"]
