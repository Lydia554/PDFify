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

# Install veraPDF (simplified approach - download installer)
RUN wget -q "https://software.verapdf.org/releases/1.24/verapdf-pdfbox-1.24.3-installer.zip" -O /tmp/verapdf.zip && \
    mkdir -p /opt/verapdf && \
    unzip -q -o /tmp/verapdf.zip -d /opt/verapdf && \
    rm -f /tmp/verapdf.zip && \
    chmod +x /opt/verapdf/verapdf-install && \
    chmod +x /opt/verapdf/verapdf-izpack-pdfbox-installer-1.24.3.jar && \
    # Try to run installer headlessly, but don't fail if it doesn't work
    (java -jar /opt/verapdf/verapdf-izpack-pdfbox-installer-1.24.3.jar -options-system /tmp/verapdf-silent.xml << 'EOF' || true)
<?xml version="1.0" encoding="UTF-8"?>
<AutomatedInstallation>
    <com.izforge.izpack.panels.HelloPanel/>
    <com.izforge.izpack.panels.TargetPanel>
        <installpath>/opt/verapdf-home</installpath>
    </com.izforge.izpack.panels.InstallPanel/>
    <com.izforge.izpack.panels.ShortcutPanel/>
    <com.izforge.izpack.panels.FinishPanel/>
</AutomatedInstallation>
EOF
    # Find veraPDF if installation succeeded, or create a placeholder
    VERAPDF_BIN=$(find /opt/verapdf-home /opt/verapdf -maxdepth 3 -type f -name 'verapdf' ! -name '*.jar' 2>/dev/null | head -1) && \
    if [ -n "$VERAPDF_BIN" ] && [ -f "$VERAPDF_BIN" ]; then \
        echo "Using veraPDF from: $VERAPDF_BIN" && \
        ln -sf "$VERAPDF_BIN" /usr/local/bin/verapdf && \
        /usr/local/bin/verapdf --version; \
    else \
        echo "WARNING: veraPDF installation skipped. Validator will use fallback mode." && \
        echo "#!/bin/sh" > /usr/local/bin/verapdf && \
        echo "echo 'veraPDF not installed. Please install manually or use online validator.'" >> /usr/local/bin/verapdf && \
        echo "exit 1" >> /usr/local/bin/verapdf && \
        chmod +x /usr/local/bin/verapdf; \
    fi

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
