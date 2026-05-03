@echo off
REM FormationAI Frontend Deployment Script for Vercel (Windows)

echo 🚀 Deploying FormationAI Frontend to Vercel...

REM Check if we're in the frontend directory
if not exist "package.json" (
    echo ❌ Error: Please run this script from the frontend directory
    exit /b 1
)

REM Check if Vercel CLI is installed
vercel --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 📦 Installing Vercel CLI...
    npm install -g vercel
)

REM Build the project first to check for errors
echo 🔨 Building project...
npm run build

if %errorlevel% neq 0 (
    echo ❌ Build failed! Please fix the errors before deploying.
    exit /b 1
)

echo ✅ Build successful!

REM Deploy to Vercel
echo 🌐 Deploying to Vercel...
vercel --prod

echo 🎉 Deployment complete!
echo.
echo 📋 Next steps:
echo 1. Update your backend CORS settings to include the Vercel domain
echo 2. Set the VITE_API_URL environment variable in Vercel dashboard
echo 3. Test the deployed application
echo.
echo 💡 Tip: You can set environment variables at:
echo    https://vercel.com/dashboard → Your Project → Settings → Environment Variables