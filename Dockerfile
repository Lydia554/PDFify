# Stage 1: Java service builder
FROM maven:3.9-eclipse-temurin-17 AS java-builder

# Copy Maven settings
COPY java/settings.xml /root/.m2/settings.xml

# Build Java service
COPY java /tmp/java
RUN cd /tmp/java && mvn clean package -DskipTests && cp target/pdfa-3b-service-1.0.0.jar /java-pdf-service.jar

# Stage 2: Node.js application
FROM node:20-slim AS node-builder

# Install veraPDF - try multiple sources
RUN echo "Installing veraPDF..." && \
    apt-get update && \
    apt-get install -y wget unzip curl && \
    echo "Trying primary source..." && \
    (wget -q "https://software.verapdf.org/releases/1.24/verapdf-pdfbox-1.24.3.tar.gz" -O /tmp/verapdf.tar.gz && \
     mkdir -p /opt/verapdf && \
     tar -xzf /tmp/verapdf.tar.gz -C /opt/verapdf && \
     rm -f /tmp/verapdf.tar.gz && \
     VERAPDF_DIR=$(find /opt/verapdf -maxdepth 1 -type d -name "verapdf*" | head -1) && \
     mv "$VERAPDF_DIR"/* /opt/verapdf/ 2>/dev/null || true && \
     rmdir "$VERAPDF_DIR" 2>/dev/null || true) || \
    (echo "Trying GitHub mirror..." && \
     wget -q "https://github.com/veraPDF/veraPDF/releases/download/v1.24/verapdf-1.24.3.tar.gz" -O /tmp/verapdf.tar.gz && \
     mkdir -p /opt/verapdf && \
     tar -xzf /tmp/verapdf.tar.gz -C /opt/verapdf && \
     rm -f /tmp/verapdf.tar.gz && \
     VERAPDF_DIR=$(find /opt/verapdf -maxdepth 1 -type d -name "verapdf*" | head -1) && \
     mv "$VERAPDF_DIR"/* /opt/verapdf/ 2>/dev/null || true && \
     rmdir "$VERAPDF_DIR" 2>/dev/null || true) && \
    chmod +x /opt/verapdf/verapdf 2>/dev/null || \
    chmod +x /opt/verapdf/bin/verapdf 2>/dev/null && \
    ln -sf /opt/verapdf/verapdf /usr/local/bin/verapdf 2>/dev/null || \
    ln -sf /opt/verapdf/bin/verapdf /usr/local/bin/verapdf 2>/dev/null || true && \
    /usr/local/bin/verapdf --version && \
    echo "✅ veraPDF installed successfully" || \
    (echo "⚠️  veraPDF installation had issues, creating wrapper..." && \
     mkdir -p /opt/verapdf && \
     echo '#!/bin/bash' > /usr/local/bin/verapdf && \
     echo 'echo "veraPDF not properly installed. Please install manually."' >> /usr/local/bin/verapdf && \
     echo 'exit 1' >> /usr/local/bin/verapdf && \
     chmod +x /usr/local/bin/verapdf) && \
    rm -rf /var/lib/apt/lists/*

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

# Install veraPDF by extracting from the official Docker image
RUN docker pull verapdf/verapdf:latest && \
    docker create --name verapdf-container verapdf/verapdf:latest && \
    docker cp verapdf-container:/opt/verapdf /opt/verapdf && \
    docker rm verapdf-container && \
    docker rmi verapdf/verapdf:latest && \
    chmod +x /opt/verapdf/verapdf && \
    ln -sf /opt/verapdf/verapdf /usr/local/bin/verapdf && \
    /usr/local/bin/verapdf --version && \
    echo "✅ veraPDF installed successfully"

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
