FROM node:20-slim

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

COPY ./app/package*.json ./
RUN npm install

COPY ./app ./

RUN mkdir -p /app/server/Helpers

# ICC Profile
COPY ./app/server/Helpers/sRGB_v4_ICC_preference.icc ./server/Helpers/sRGB_v4_ICC_preference.icc

# Only PDFBox 2.x compatible JARs
COPY ./app/server/Helpers/preflight-app-2.0.24.jar ./server/Helpers/preflight-app-2.0.24.jar
COPY ./app/server/Helpers/pdfbox-2.0.24.jar ./server/Helpers/pdfbox-2.0.24.jar
COPY ./app/server/Helpers/pdfbox-tools-2.0.24.jar ./server/Helpers/pdfbox-tools-2.0.24.jar
COPY ./app/server/Helpers/fontbox-2.0.24.jar ./server/Helpers/fontbox-2.0.24.jar
COPY ./app/server/Helpers/xmpbox-2.0.24.jar ./server/Helpers/xmpbox-2.0.24.jar
COPY ./app/server/Helpers/commons-logging-1.2.jar ./server/Helpers/commons-logging-1.2.jar
COPY ./app/server/Helpers/activation-1.1.1.jar ./server/Helpers/activation-1.1.1.jar

# Java source
COPY ./app/server/Helpers/com/yourcompany/PdfA3bFixer.java ./server/Helpers/com/yourcompany/PdfA3bFixer.java

# Compile PdfA3bFixer using ONLY 2.x JARs
RUN mkdir -p /app/server/Helpers/classes \
    && javac \
       -cp "./server/Helpers/preflight-app-2.0.24.jar:./server/Helpers/pdfbox-2.0.24.jar:./server/Helpers/fontbox-2.0.24.jar:./server/Helpers/xmpbox-2.0.24.jar:./server/Helpers/commons-logging-1.2.jar:./server/Helpers/activation-1.1.1.jar" \
       -d ./server/Helpers/classes \
       ./server/Helpers/com/yourcompany/PdfA3bFixer.java

COPY ./app/server/routes/pdfa_def.ps ./pdfa_def.ps

CMD ["node", "server/index.js"]

