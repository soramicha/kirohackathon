#!/usr/bin/env python3
"""
Quick test to verify cookie detection is working.
Run this to see what cookie method will be used.
"""

import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from services.downloader import get_cookie_options


def main():
    print("=" * 60)
    print("🍪 Cookie Detection Test")
    print("=" * 60)
    print()
    
    # Show environment
    print("📍 Environment:")
    print(f"   Working directory: {Path.cwd()}")
    print(f"   RENDER: {os.getenv('RENDER', 'not set')}")
    print(f"   YOUTUBE_COOKIES_BASE64: {'set' if os.getenv('YOUTUBE_COOKIES_BASE64') else 'not set'}")
    print()
    
    # Check for cookies.txt
    cookie_file = Path("cookies.txt")
    print(f"📄 cookies.txt: {'exists' if cookie_file.exists() else 'not found'}")
    if cookie_file.exists():
        size = cookie_file.stat().st_size
        print(f"   Size: {size:,} bytes")
    print()
    
    # Test cookie detection
    print("🔍 Testing cookie detection...")
    print()
    
    cookie_opts = get_cookie_options()
    
    print()
    print("=" * 60)
    print("📊 Result:")
    print("=" * 60)
    
    if cookie_opts:
        print("✅ Cookies will be used!")
        print()
        print("Options:")
        for key, value in cookie_opts.items():
            print(f"   {key}: {value}")
    else:
        print("❌ No cookies will be used")
        print()
        print("⚠️  Downloads may trigger bot detection")
        print()
        print("💡 To fix:")
        print("   1. Export cookies: python3 export_cookies.py chrome")
        print("   2. Or set YOUTUBE_COOKIES_BASE64 environment variable")
    
    print()


if __name__ == "__main__":
    main()
