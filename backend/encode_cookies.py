#!/usr/bin/env python3
"""
Helper script to encode cookies.txt file to base64 for deployment.
"""

import base64
import sys
from pathlib import Path

def encode_cookies_file(cookies_path):
    """Encode cookies file to base64 for environment variable."""
    
    cookies_file = Path(cookies_path)
    if not cookies_file.exists():
        print(f"❌ Error: {cookies_path} not found")
        return None
    
    try:
        # Read cookies file
        with open(cookies_file, 'r', encoding='utf-8') as f:
            cookies_content = f.read()
        
        # Encode to base64
        cookies_bytes = cookies_content.encode('utf-8')
        cookies_b64 = base64.b64encode(cookies_bytes).decode('utf-8')
        
        print(f"✅ Successfully encoded {cookies_path}")
        print(f"📏 Original size: {len(cookies_content)} characters")
        print(f"📏 Encoded size: {len(cookies_b64)} characters")
        print()
        print("🔑 Base64 encoded cookies (copy this to YOUTUBE_COOKIES_B64 environment variable):")
        print("-" * 80)
        print(cookies_b64)
        print("-" * 80)
        print()
        print("📋 Next steps:")
        print("1. Copy the base64 string above")
        print("2. Go to Render Dashboard → Your Service → Environment")
        print("3. Add environment variable:")
        print("   Name: YOUTUBE_COOKIES_B64")
        print("   Value: [paste the base64 string]")
        print("4. Redeploy your service")
        
        return cookies_b64
        
    except Exception as e:
        print(f"❌ Error encoding cookies: {e}")
        return None

def test_decode(cookies_b64):
    """Test decoding the base64 cookies."""
    try:
        decoded = base64.b64decode(cookies_b64).decode('utf-8')
        if 'youtube.com' in decoded:
            print("✅ Decode test successful - YouTube cookies detected")
        else:
            print("⚠️  Decode test successful but no YouTube cookies found")
        return True
    except Exception as e:
        print(f"❌ Decode test failed: {e}")
        return False

def main():
    if len(sys.argv) != 2:
        print("Usage: python encode_cookies.py <cookies.txt>")
        print()
        print("Example:")
        print("  python encode_cookies.py cookies.txt")
        print("  python encode_cookies.py /path/to/cookies.txt")
        sys.exit(1)
    
    cookies_path = sys.argv[1]
    
    print("🍪 YouTube Cookies Encoder for Deployment")
    print("=" * 50)
    
    # Encode cookies
    cookies_b64 = encode_cookies_file(cookies_path)
    
    if cookies_b64:
        print()
        print("🧪 Testing decode...")
        test_decode(cookies_b64)
        
        # Save to file for reference
        output_file = Path(cookies_path).with_suffix('.b64')
        with open(output_file, 'w') as f:
            f.write(cookies_b64)
        print(f"💾 Base64 cookies also saved to: {output_file}")

if __name__ == "__main__":
    main()