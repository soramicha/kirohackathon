#!/bin/bash

# FormationAI Frontend Deployment Script for Vercel

echo "🚀 Deploying FormationAI Frontend to Vercel..."

# Check if we're in the frontend directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the frontend directory"
    exit 1
fi

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

# Build the project first to check for errors
echo "🔨 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Please fix the errors before deploying."
    exit 1
fi

echo "✅ Build successful!"

# Deploy to Vercel
echo "🌐 Deploying to Vercel..."
vercel --prod

echo "🎉 Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update your backend CORS settings to include the Vercel domain"
echo "2. Set the VITE_API_URL environment variable in Vercel dashboard"
echo "3. Test the deployed application"
echo ""
echo "💡 Tip: You can set environment variables at:"
echo "   https://vercel.com/dashboard → Your Project → Settings → Environment Variables"