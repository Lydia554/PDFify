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

# Copy package.json first for caching
COPY ./app/package*.json ./

# Install Node dependencies
RUN npm install

# Copy app code
COPY ./app ./

# Ensure Helpers directory exists
RUN mkdir -p /app/server/Helpers


# Copy ICC profile
COPY ./app/server/Helpers/sRGB_v4_ICC_preference.icc ./server/Helpers/sRGB_v4_ICC_preference.icc

# Copy PDFBox + helper JARs
COPY ./app/server/Helpers/commons-logging-1.2.jar ./server/Helpers/commons-logging-1.2.jar
COPY ./app/server/Helpers/activation-1.1.1.jar ./server/Helpers/activation-1.1.1.jar

# Your Preflight JAR (2.0.24)
COPY ./app/server/Helpers/preflight-app-2.0.24.jar ./server/Helpers/preflight-app-2.0.24.jar

# Copy Java source
COPY ./app/server/Helpers/com/yourcompany/PdfA3bFixer.java ./server/Helpers/com/yourcompany/PdfA3bFixer.java

# Compile PdfA3bFixer 
RUN mkdir -p /app/server/Helpers/classes \
    && javac \
       -cp "./server/Helpers/pdfbox-3.0.6.jar:./server/Helpers/pdfbox-io-3.0.6.jar:./server/Helpers/preflight-3.0.6.jar:./server/Helpers/fontbox-3.0.6.jar:./server/Helpers/xmpbox-3.0.6.jar:./server/Helpers/commons-logging-1.2.jar:./server/Helpers/activation-1.1.1.jar:./server/Helpers/preflight-app-2.0.24.jar" \
       -d ./server/Helpers/classes \
       ./server/Helpers/com/yourcompany/PdfA3bFixer.java


# Copy PDF/A definition file
COPY ./app/server/routes/pdfa_def.ps ./pdfa_def.ps

CMD ["node", "server/index.js"]

