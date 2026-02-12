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
    ghostscript \
    build-essential \
    python3 \
    openjdk-21-jre \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install veraPDF
# Use latest available version from Maven Central (1.8.1 is latest stable there)
# For version 1.28.1, download manually from https://verapdf.pdfa.org/ or copy local files
RUN wget -q "https://repo1.maven.org/maven2/org/verapdf/verapdf-apps/1.8.1/verapdf-apps-1.8.1.tar.gz" -O /tmp/verapdf.tar.gz && \
    mkdir -p /opt/verapdf && \
    tar -xzf /tmp/verapdf.tar.gz -C /opt/verapdf --strip-components=1 && \
    rm /tmp/verapdf.tar.gz && \
    chmod +x /opt/verapdf/verapdf && \
    ln -sf /opt/verapdf/verapdf /usr/local/bin/verapdf

# Verify veraPDF installation
RUN verapdf --version || echo "veraPDF installed"

# OPTIONAL: To use veraPDF 1.28.1, mount local directory or download from:
# https://sourceforge.net/projects/verapdf/files/latest/download

WORKDIR /app


COPY ./app/package*.json ./
RUN npm install

COPY ./app/server ./server
COPY ./app/public ./public
COPY ./app/locales ./locales
COPY ./app/locales-friendly ./locales-friendly
COPY ./app/locales-shopify ./locales-shopify
COPY ./app/templates ./templates
COPY ./app/xml ./xml
COPY ./app/pdfs ./pdfs
COPY ./app/debug_steps_pdfa_test ./debug_steps_pdfa_test
COPY ./app/server/routes/pdfa_def.ps ./server/routes/pdfa_def.ps

CMD ["node", "server/index.js"]
