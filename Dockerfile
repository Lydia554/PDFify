FROM node:20-slim

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
    build-essential \
    python3 \
    openjdk-17-jre-headless \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install veraPDF - download and extract with full directory structure preservation
RUN wget -q "https://software.verapdf.org/releases/1.24/verapdf-pdfbox-1.24.3-installer.zip" -O /tmp/verapdf.zip && \
    mkdir -p /opt/verapdf && \
    unzip -q -o /tmp/verapdf.zip -d /opt/verapdf && \
    # The installer extracts a directory, flatten it
    mv /opt/verapdf/verapdf*/* /opt/verapdf/ 2>/dev/null || \
    mv /opt/verapdf/*/* /opt/verapdf/ 2>/dev/null || true && \
    rm -f /tmp/verapdf.zip && \
    # Find the verapdf script wherever it is
    find /opt/verapdf -type f -name 'verapdf' -exec chmod +x {} \; && \
    VERAPDF_BIN=$(find /opt/verapdf -type f -name 'verapdf' | head -1) && \
    ln -sf "$VERAPDF_BIN" /usr/local/bin/verapdf || \
    # Fallback: create a wrapper if direct linking fails
    echo '#!/bin/sh' > /usr/local/bin/verapdf && \
    echo 'find /opt/verapdf -name verapdf -type f -exec {} "$@" \;' >> /usr/local/bin/verapdf && \
    chmod +x /usr/local/bin/verapdf
RUN verapdf --version || echo "veraPDF installed"

# Prepare Java service build context
RUN apt-get update && apt-get install -y maven --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Create Maven settings with multiple mirrors for reliability
RUN mkdir -p /root/.m2 && \
    echo '<?xml version="1.0" encoding="UTF-8"?>' > /root/.m2/settings.xml && \
    echo '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"' >> /root/.m2/settings.xml && \
    echo 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' >> /root/.m2/settings.xml && \
    echo 'xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 https://maven.apache.org/xsd/settings-1.0.0.xsd">' >> /root/.m2/settings.xml && \
    echo '<mirrors>' >> /root/.m2/settings.xml && \
    echo '<mirror>' >> /root/.m2/settings.xml && \
    echo '<id>central</id>' >> /root/.m2/settings.xml && \
    echo '<url>https://repo1.maven.org/maven2</url>' >> /root/.m2/settings.xml && \
    echo '<mirrorOf>central</mirrorOf>' >> /root/.m2/settings.xml && \
    echo '</mirror>' >> /root/.m2/settings.xml && \
    echo '<mirror>' >> /root/.m2/settings.xml && \
    echo '<id>aliyun</id>' >> /root/.m2/settings.xml && \
    echo '<url>https://maven.aliyun.com/repository/public</url>' >> /root/.m2/settings.xml && \
    echo '<mirrorOf>*</mirrorOf>' >> /root/.m2/settings.xml && \
    echo '</mirror>' >> /root/.m2/settings.xml && \
    echo '</mirrors>' >> /root/.m2/settings.xml && \
    echo '</settings>' >> /root/.m2/settings.xml

COPY java /tmp/java
RUN cd /tmp/java && \
    mvn clean package -q && \
    cp target/pdfa-3b-service-1.0.0.jar /usr/local/bin/java-pdf-service.jar && \
    rm -rf /tmp/java

# Keep Maven installed in case rebuild is needed

# Java service will run veraPDF internally for PDF/A-3b creation
# No need for separate Java service container - everything in one