FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Copy Maven project files
COPY pom.xml .
COPY src ./src
COPY sRGB.icc /app/sRGB.icc

# Install Maven
RUN apk add --no-cache openjdk21 maven

# Build Java service
RUN mvn clean package -q

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8080/health || exit 1

# Run Java service
CMD ["java", "-jar", "target/pdfa-3b-service-1.0.0.jar"]
