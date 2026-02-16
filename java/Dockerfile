# Build stage
FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /build
COPY . .

# Build the JAR
RUN mvn clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:17-jre-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy JAR from builder
COPY --from=builder /build/target/pdfa-3b-service-1.0.0.jar /app/java-pdf-service.jar

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Run the Java service
ENTRYPOINT ["java", "-jar", "/app/java-pdf-service.jar"]
