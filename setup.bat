@echo off
echo ========================================
echo   TIM KIEM SACH - Setup Script
echo ========================================
echo.

REM Tạo thư mục public nếu chưa có
if not exist "public" mkdir public

REM Copy file GLTF sang public
if exist "thietkekesach.gltf" (
    copy /Y "thietkekesach.gltf" "public\thietkekesach.gltf"
    echo [OK] Copied thietkekesach.gltf to public/
) else (
    echo [WARN] thietkekesach.gltf not found in root!
)

REM Cài đặt dependencies
echo.
echo Installing npm dependencies...
call npm install

echo.
echo ========================================
echo   Setup complete!
echo   Run "npm run dev" to start.
echo ========================================
pause
