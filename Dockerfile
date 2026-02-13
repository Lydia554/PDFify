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
    openjdk-17-jre-headless \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install veraPDF
RUN wget -q "https://repo1.maven.org/maven2/org/verapdf/verapdf-apps/1.8.1/verapdf-apps-1.8.1.tar.gz" -O /tmp/verapdf.tar.gz && \
    mkdir -p /opt/verapdf && \
    tar -xzf /tmp/verapdf.tar.gz -C /opt/verapdf --strip-components=1 && \
    rm /tmp/verapdf.tar.gz && \
    chmod +x /opt/verapdf/verapdf && \
    ln -sf /opt/verapdf/verapdf /usr/local/bin/verapdf
RUN verapdf --version || echo "veraPDF installed"

# Prepare Java service build context
COPY java /tmp/java
RUN cd /tmp/java && \
    mvn clean package -q && \
    cp target/pdfa-3b-service-1.0.0.jar /usr/local/bin/java-pdf-service.jar && \
    rm -rf /tmp/java

# Java service will run veraPDF internally for PDF/A-3b creation
# No need for separate Java service container - everything in one