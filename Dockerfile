FROM node:20-slim

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
    build-essential \
    python3 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ./app/package*.json ./
RUN npm install

COPY ./app ./

RUN mkdir -p /app/server/Helpers

# ICC Profile
COPY ./app/server/Helpers/sRGB_v4_ICC_preference.icc ./server/Helpers/sRGB_v4_ICC_preference.icc

COPY ./app/server/routes/pdfa_def.ps ./pdfa_def.ps

CMD ["node", "server/index.js"]

