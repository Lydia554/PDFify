@echo off
REM Build PDF/A-3B Java Service with Maven
REM Requires: Maven 3.x and Java 21

echo ========================================
echo Building PDF/A-3B Java Service
echo ========================================
echo.

REM Check Maven
where mvn >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Maven not found! Please install Maven first.
    echo Download from: https://maven.apache.org/download.cgi
    pause
    exit /b 1
)

REM Check Java
java -version >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Java not found! Please install Java 21.
    echo Download from: https://www.oracle.com/java/technologies/downloads/
    pause
    exit /b 1
)

REM Build with Maven
echo Building with Maven...
call mvn clean package

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Build SUCCESS!
    echo ========================================
    echo JAR location: target\pdfa-3b-service-1.0.0.jar
    echo.
    echo To run: java -jar target\pdfa-3b-service-1.0.0.jar
) else (
    echo.
    echo ========================================
    echo Build FAILED!
    echo ========================================
)

pause
