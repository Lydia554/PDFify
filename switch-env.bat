@echo off
echo ===========================================
echo PDFify Pro - Environment Switcher
echo ===========================================
echo.
echo Current .env files:
echo   [1] Development (local MongoDB)
echo   [2] Production (Docker)
echo.
set /p choice="Select environment to activate (1 or 2): "

if "%choice%"=="1" (
    echo.
    echo Switching to DEVELOPMENT...
    copy /Y .env.development .env
    echo.
    echo [OK] Now using .env.development (local MongoDB at localhost:27017)
) else if "%choice%"=="2" (
    echo.
    echo Switching to PRODUCTION (Docker)...
    REM Save the production config to .env.production if it doesn't exist
    if not exist .env.production (
        echo NOTE: Creating .env.production from current .env
        copy /Y .env .env.production
    )
    REM Restore production config
    copy /Y .env.production .env
    echo.
    echo [OK] Now using .env.production (Docker with mongo:27017)
    echo.
    echo Run with: docker-compose up -d
) else (
    echo Invalid choice!
)

echo.
pause
