#!/bin/bash

echo "🍪 Render Cookie Setup"
echo "======================"
echo

# Check if cookies.txt exists
if [ -f cookies.txt ]; then
    echo "✅ Found existing cookies.txt"
    read -p "   Export fresh cookies? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm cookies.txt
    else
        echo "   Using existing cookies.txt"
        echo
    fi
fi

# Export cookies if needed
if [ ! -f cookies.txt ]; then
    echo "Step 1: Exporting cookies from Chrome..."
    python3 export_cookies.py chrome
    
    if [ ! -f cookies.txt ]; then
        echo "❌ Failed to export cookies"
        echo
        echo "Troubleshooting:"
        echo "  1. Make sure Chrome is installed"
        echo "  2. Log into YouTube in Chrome"
        echo "  3. Try: python3 export_cookies.py firefox"
        exit 1
    fi
fi

echo "✅ Cookies ready"
echo

# Encode to base64
echo "Step 2: Encoding to base64..."

# Detect OS for base64 command
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    BASE64_COOKIES=$(base64 -i cookies.txt | tr -d '\n')
else
    # Linux
    BASE64_COOKIES=$(base64 -w 0 cookies.txt)
fi

echo "✅ Encoded (${#BASE64_COOKIES} characters)"
echo

# Display instructions
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Add to Render Environment Variables"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "1. Go to: https://dashboard.render.com"
echo "2. Select your web service"
echo "3. Click 'Environment' in the left sidebar"
echo "4. Click 'Add Environment Variable'"
echo "5. Enter:"
echo
echo "   Key: YOUTUBE_COOKIES_BASE64"
echo
echo "   Value: (copy the text below)"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$BASE64_COOKIES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "6. Click 'Save Changes'"
echo "7. Render will automatically redeploy"
echo
echo "✅ Setup complete!"
echo
echo "📝 Notes:"
echo "   - Cookies expire after ~30 days"
echo "   - Re-run this script to update"
echo "   - Check logs for: 'Using cookies from environment variable'"
echo
echo "🔒 Security:"
echo "   - Never commit cookies.txt to git"
echo "   - Keep YOUTUBE_COOKIES_BASE64 secret"
echo "   - Use separate YouTube account for automation"
echo
