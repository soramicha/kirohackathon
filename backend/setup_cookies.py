#!/usr/bin/env python3
"""
Quick setup script to help with YouTube cookie configuration.
"""

import os
import sys
from pathlib import Path

def check_cookies_file():
    """Check if cookies.txt exists and is valid."""
    cookies_path = Path("cookies.txt")
    if cookies_path.exists():
        print("✅ cookies.txt found!")
        with open(cookies_path, 'r') as f:
            content = f.read()
            if 'youtube.com' in content:
                print("✅ YouTube cookies detected in file")
                return True
            else:
                print("❌ No YouTube cookies found in file")
                return False
    else:
        print("❌ cookies.txt not found")
        return False

def test_browser_cookies():
    """Test if browser cookies are accessible."""
    try:
        import yt_dlp
        browsers = ["firefox", "edge", "chrome"]
        
        for browser in browsers:
            try:
                # Test if we can access browser cookies
                ydl_opts = {
                    "cookiesfrombrowser": (browser,),
                    "quiet": True,
                    "no_warnings": True,
                    "skip_download": True,
                }
                
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    # Try to extract info from a simple YouTube video
                    ydl.extract_info("https://www.youtube.com/watch?v=dQw4w9WgXcQ", download=False)
                
                print(f"✅ {browser.title()} cookies accessible")
                return True
                
            except Exception as e:
                print(f"❌ {browser.title()} cookies failed: {str(e)[:100]}...")
                continue
                
        return False
        
    except ImportError:
        print("❌ yt-dlp not installed")
        return False

def print_instructions():
    """Print setup instructions."""
    print("\n" + "="*60)
    print("YOUTUBE COOKIES SETUP INSTRUCTIONS")
    print("="*60)
    print()
    print("Option 1: Manual Cookies File (Recommended)")
    print("1. Install browser extension 'Get cookies.txt LOCALLY'")
    print("2. Sign into YouTube in your browser")
    print("3. Go to any YouTube video")
    print("4. Click the extension and export cookies for youtube.com")
    print("5. Save the file as 'cookies.txt' in this directory")
    print()
    print("Option 2: Browser Cookies (Automatic)")
    print("1. Make sure you're signed into YouTube in Firefox/Edge/Chrome")
    print("2. Close Chrome completely if using Chrome cookies")
    print("3. The system will automatically try to use browser cookies")
    print()
    print("Option 3: Environment Variable")
    print("1. Export cookies to any location")
    print("2. Set YOUTUBE_COOKIES_FILE environment variable:")
    print("   Windows: set YOUTUBE_COOKIES_FILE=C:\\path\\to\\cookies.txt")
    print("   Linux/Mac: export YOUTUBE_COOKIES_FILE=/path/to/cookies.txt")
    print()
    print("For detailed instructions, see: YOUTUBE_COOKIES_SETUP.md")

def main():
    print("YouTube Cookies Setup Checker")
    print("="*40)
    
    # Check current directory
    current_dir = Path.cwd()
    print(f"Current directory: {current_dir}")
    
    # Check for cookies file
    has_cookies_file = check_cookies_file()
    
    # Test browser cookies
    print("\nTesting browser cookie access...")
    has_browser_cookies = test_browser_cookies()
    
    # Summary
    print("\n" + "="*40)
    print("SUMMARY")
    print("="*40)
    
    if has_cookies_file:
        print("✅ Ready to go! cookies.txt file is set up correctly.")
    elif has_browser_cookies:
        print("✅ Browser cookies are accessible. Should work automatically.")
    else:
        print("❌ No authentication method available.")
        print_instructions()
        return 1
    
    print("\nTo test, try downloading a video with your backend server.")
    return 0

if __name__ == "__main__":
    sys.exit(main())