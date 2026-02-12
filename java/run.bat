@echo off
REM Run PDF/A-3B Java Service
REM Port: 8080

echo Starting PDF/A-3B Service on port 8080...
echo.

if not exist "target\pdfa-3b-service-1.0.0.jar" (
    echo ERROR: JAR not found! Please run build.bat first.
    pause
    exit /b 1
)

java -jar target\pdfa-3b-service-1.0.0.jar

pause
