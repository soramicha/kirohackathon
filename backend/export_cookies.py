#!/usr/bin/env python3
"""
Export browser cookies for yt-dlp to avoid bot detection.

Usage:
    python export_cookies.py [browser]

Examples:
    python export_cookies.py chrome
    python export_cookies.py firefox
    python export_cookies.py edge

This will create a cookies.txt file that yt-dlp can use.
"""

import sys
import subprocess
from pathlib import Path


def export_cookies(browser="chrome"):
    """
    Export cookies from browser using yt-dlp.
    Creates cookies.txt file in the backend directory.
    """
    output_file = Path("cookies.txt")
    
    print(f"🍪 Exporting cookies from {browser}...")
    print(f"📁 Output file: {output_file.absolute()}")
    
    try:
        # Use yt-dlp to extract cookies from browser
        cmd = [
            "yt-dlp",
            "--cookies-from-browser", browser,
            "--cookies", str(output_file),
            "--skip-download",
            "https://www.youtube.com/watch?v=jNQXAC9IVRw"  # Short test video
        ]
        
        print(f"🔧 Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            if output_file.exists():
                print(f"✅ Success! Cookies exported to: {output_file}")
                print(f"📊 File size: {output_file.stat().st_size} bytes")
                print()
                print("⚠️  IMPORTANT:")
                print("   - This file contains cookies for ALL websites")
                print("   - Keep it secure and don't commit to git")
                print("   - Add 'cookies.txt' to .gitignore")
                print()
                print("🚀 The downloader will automatically use this file")
                return True
            else:
                print(f"❌ Cookie file not created")
                return False
        else:
            print(f"❌ Export failed:")
            print(result.stderr)
            return False
            
    except FileNotFoundError:
        print("❌ yt-dlp not found. Install it first:")
        print("   pip install -U yt-dlp")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def check_browser_access(browser="chrome"):
    """Check if browser cookies are accessible"""
    print(f"🔍 Checking {browser} cookie access...")
    
    try:
        cmd = ["yt-dlp", "--cookies-from-browser", browser, "--print", "title", "--skip-download", "https://www.youtube.com/watch?v=jNQXAC9IVRw"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            print(f"✅ {browser} cookies are accessible")
            return True
        else:
            print(f"❌ Cannot access {browser} cookies")
            print(f"   Error: {result.stderr[:200]}")
            return False
    except Exception as e:
        print(f"❌ Error checking {browser}: {e}")
        return False


def main():
    browser = sys.argv[1] if len(sys.argv) > 1 else "chrome"
    
    print("=" * 60)
    print("🍪 Cookie Export Tool for yt-dlp")
    print("=" * 60)
    print()
    
    # Check if cookies.txt already exists
    if Path("cookies.txt").exists():
        print("⚠️  cookies.txt already exists!")
        response = input("   Overwrite? (y/n): ").lower()
        if response != 'y':
            print("❌ Cancelled")
            return
        print()
    
    # Check browser access first
    if not check_browser_access(browser):
        print()
        print("💡 Troubleshooting:")
        print(f"   1. Make sure {browser} is installed")
        print(f"   2. Make sure you're logged into YouTube in {browser}")
        print(f"   3. Try a different browser: chrome, firefox, edge")
        print()
        print("   Example: python export_cookies.py firefox")
        return
    
    print()
    
    # Export cookies
    if export_cookies(browser):
        print()
        print("✅ Setup complete!")
        print()
        print("📝 Next steps:")
        print("   1. Add 'cookies.txt' to .gitignore")
        print("   2. Restart your backend server")
        print("   3. Try downloading a video")
        print()
        print("🔒 Security reminder:")
        print("   - Never commit cookies.txt to git")
        print("   - Never share this file")
        print("   - Regenerate if compromised")
    else:
        print()
        print("❌ Export failed. See errors above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
