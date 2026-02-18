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

# Install veraPDF - download the packaged version (not installer)
RUN wget -q "https://github.com/veraPDF/veraPDF-packaging/releases/download/v1.24.3/verapdf-1.24.3.zip" -O /tmp/verapdf.zip && \
    mkdir -p /opt/verapdf && \
    unzip -q -o /tmp/verapdf.zip -d /opt/verapdf && \
    mv /opt/verapdf/verapdf-1.24.3/* /opt/verapdf/ && \
    rm -f /tmp/verapdf.zip && \
    rmdir /opt/verapdf/verapdf-1.24.3 && \
    chmod +x /opt/verapdf/verapdf && \
    ls -la /opt/verapdf/ && \
    ln -sf /opt/verapdf/verapdf /usr/local/bin/verapdf && \
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