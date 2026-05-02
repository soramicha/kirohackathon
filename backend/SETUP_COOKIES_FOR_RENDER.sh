#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     🍪 Render Cookie Setup - Automated                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo

# Step 1: Check if cookies.txt exists
if [ -f cookies.txt ]; then
    echo "✅ Found existing cookies.txt"
    echo "   Size: $(wc -c < cookies.txt) bytes"
    echo
    read -p "   Export fresh cookies? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm cookies.txt
        echo "   Deleted old cookies.txt"
    fi
fi

# Step 2: Export cookies if needed
if [ ! -f cookies.txt ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Step 1: Exporting Cookies from Chrome"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    
    python3 export_cookies.py chrome
    
    if [ ! -f cookies.txt ]; then
        echo
        echo "❌ Failed to export cookies"
        echo
        echo "Troubleshooting:"
        echo "  1. Make sure Chrome is installed"
        echo "  2. Log into YouTube in Chrome"
        echo "  3. Try: python3 export_cookies.py firefox"
        echo
        exit 1
    fi
    
    echo
fi

# Step 3: Verify cookies.txt
SIZE=$(wc -c < cookies.txt)
if [ $SIZE -lt 100 ]; then
    echo "❌ cookies.txt is too small ($SIZE bytes)"
    echo "   Expected at least 100 bytes"
    echo
    exit 1
fi

echo "✅ cookies.txt ready ($SIZE bytes)"
echo

# Step 4: Encode to base64
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Encoding to Base64"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

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

# Step 5: Copy to clipboard (if possible)
if command -v pbcopy &> /dev/null; then
    echo "$BASE64_COOKIES" | pbcopy
    echo "✅ Copied to clipboard (macOS)"
    echo
elif command -v xclip &> /dev/null; then
    echo "$BASE64_COOKIES" | xclip -selection clipboard
    echo "✅ Copied to clipboard (Linux)"
    echo
fi

# Step 6: Display instructions
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Add to Render"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "1. Go to: https://dashboard.render.com"
echo "2. Select your web service"
echo "3. Click 'Environment' in left sidebar"
echo "4. Click 'Add Environment Variable'"
echo "5. Enter:"
echo
echo "   Key:   YOUTUBE_COOKIES_BASE64"
echo
echo "   Value: (paste from clipboard or copy below)"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$BASE64_COOKIES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "6. Click 'Save Changes'"
echo "7. Wait for Render to redeploy (~2 minutes)"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Verify"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "After Render redeploys, check logs for:"
echo
echo "   [downloader] ✅ Using cookies from environment variable"
echo
echo "✅ Setup complete!"
echo
echo "📝 Notes:"
echo "   • Cookies expire after ~30 days"
echo "   • Re-run this script to update"
echo "   • Keep YOUTUBE_COOKIES_BASE64 secret"
echo
echo "🔒 Security:"
echo "   • Never commit cookies.txt to git"
echo "   • Use separate YouTube account for automation"
echo
