# Stage 1: Java service builder
FROM maven:3.9-eclipse-temurin-17 AS java-builder

# Create improved Maven settings with multiple mirrors and fallbacks
RUN mkdir -p /root/.m2 && \
    cat > /root/.m2/settings.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 https://maven.apache.org/xsd/settings-1.0.0.xsd">
  
  <!-- Use multiple mirrors for reliability -->
  <mirrors>
    <!-- Primary: Aliyun (fast in China) -->
    <mirror>
      <id>aliyun</id>
      <name>Aliyun Maven Mirror</name>
      <url>https://maven.aliyun.com/repository/public</url>
      <mirrorOf>central</mirrorOf>
    </mirror>
    
    <!-- Fallback: Maven Central -->
    <mirror>
      <id>central</id>
      <name>Maven Central</name>
      <url>https://repo.maven.apache.org/maven2</url>
      <mirrorOf>*,!aliyun</mirrorOf>
    </mirror>
  </mirrors>
  
  <!-- Plugin repositories -->
  <pluginRepositories>
    <pluginRepository>
      <id>central</id>
      <name>Maven Central Plugin Repository</name>
      <url>https://repo.maven.apache.org/maven2</url>
      <releases>
        <enabled>true</enabled>
      </releases>
      <snapshots>
        <enabled>false</enabled>
      </snapshots>
    </pluginRepository>
  </pluginRepositories>
  
  <!-- Increase timeout for slow networks -->
  <servers>
    <server>
      <id>central</id>
      <configuration>
        <httpConfiguration>
          <all>
            <connectionTimeout>120000</connectionTimeout>
            <readTimeout>120000</readTimeout>
          </all>
        </httpConfiguration>
      </configuration>
    </server>
  </servers>
  
</settings>
EOF

# Build Java service with retry logic
COPY java /tmp/java
RUN cd /tmp/java && \
    # Try with Aliyun first, fall back to Maven Central if needed
    mvn clean package -q -DskipTests || \
    (echo "First build attempt failed, retrying with Maven Central..." && \
     sed -i 's|<mirrorOf>central</mirrorOf>|<mirrorOf>!central</mirrorOf>|' /root/.m2/settings.xml && \
     mvn clean package -q -DskipTests) && \
    cp target/pdfa-3b-service-1.0.0.jar /java-pdf-service.jar

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
    mv /opt/verapdf/verapdf*/* /opt/verapdf/ 2>/dev/null || \
    mv /opt/verapdf/*/* /opt/verapdf/ 2>/dev/null || true && \
    rm -f /tmp/verapdf.zip && \
    find /opt/verapdf -type f -name 'verapdf' -exec chmod +x {} \; && \
    VERAPDF_BIN=$(find /opt/verapdf -type f -name 'verapdf' | head -1) && \
    ln -sf "$VERAPDF_BIN" /usr/local/bin/verapdf || \
    echo '#!/bin/sh' > /usr/local/bin/verapdf && \
    echo 'find /opt/verapdf -name verapdf -type f -exec {} "$@" \;' >> /usr/local/bin/verapdf && \
    chmod +x /usr/local/bin/verapdf

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