# Stage 1: Java service builder
FROM maven:3.9-eclipse-temurin-17 AS java-builder

# Copy Maven settings
COPY java/settings.xml /root/.m2/settings.xml

# Build Java service
COPY java /tmp/java
RUN cd /tmp/java && mvn clean package -DskipTests && cp target/pdfa-3b-service-1.0.0.jar /java-pdf-service.jar

# Stage 2: Node.js application
FROM node:20-slim AS node-builder

# Install system dependencies in one layer
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
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

# Install veraPDF
RUN wget -q "https://software.verapdf.org/releases/1.24/verapdf-pdfbox-1.24.3-installer.zip" -O /tmp/verapdf.zip && \
    mkdir -p /opt/verapdf && \
    unzip -q -o /tmp/verapdf.zip -d /opt/verapdf && \
    (mv /opt/verapdf/verapdf-pdfbox-*/* /opt/verapdf/ 2>/dev/null || true) && \
    rm -f /tmp/verapdf.zip && \
    ls -la /opt/verapdf/ && \
    find /opt/verapdf -type f -name 'verapdf' ! -name '*.jar' ! -name '*install*' -exec chmod +x {} \; && \
    find /opt/verapdf -type f -name '*.jar' ! -name '*installer*' -exec chmod +x {} \; && \
    VERAPDF_BIN=$(find /opt/verapdf -maxdepth 2 -type f -name 'verapdf' ! -name '*.jar' ! -name '*install*' | head -1) && \
    VERAPDF_JAR=$(find /opt/verapdf -maxdepth 2 -type f -name 'verapdf*.jar' ! -name '*installer*' | head -1) && \
    echo "Found veraPDF binary: $VERAPDF_BIN" && \
    echo "Found veraPDF JAR: $VERAPDF_JAR" && \
    if [ -n "$VERAPDF_BIN" ] && [ -f "$VERAPDF_BIN" ]; then \
        echo "Using native binary" && \
        ln -sf "$VERAPDF_BIN" /usr/local/bin/verapdf; \
    elif [ -n "$VERAPDF_JAR" ] && [ -f "$VERAPDF_JAR" ]; then \
        echo "Using JAR file" && \
        echo '#!/bin/sh' > /usr/local/bin/verapdf && \
        echo "exec java -jar \"$VERAPDF_JAR\" \"\$@\"" >> /usr/local/bin/verapdf && \
        chmod +x /usr/local/bin/verapdf; \
    else \
        echo "ERROR: veraPDF not found!" && \
        find /opt/verapdf -type f -name 'verapdf*' && \
        ls -laR /opt/verapdf/ && \
        exit 1; \
    fi && \
    /usr/local/bin/verapdf --version

WORKDIR /app

# Copy package files first for better caching
COPY ./app/package*.json ./

# Install dependencies (cached unless package.json changes)
RUN npm ci --only=production

# Copy application code
COPY ./app ./

# Copy Java service from builder
COPY --from=java-builder /java-pdf-service.jar /usr/local/bin/java-pdf-service.jar

RUN mkdir -p /app/server/Helpers

# ICC Profile
COPY ./app/server/Helpers/sRGB_v4_ICC_preference.icc ./server/Helpers/sRGB_v4_ICC_preference.icc

EXPOSE 3000

CMD ["node", "server/index.js"]