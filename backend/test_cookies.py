#!/usr/bin/env python3
"""
Test script to verify cookie setup for yt-dlp.
Tests all cookie methods and provides detailed diagnostics.
"""

import sys
from pathlib import Path
import subprocess


def test_cookie_file():
    """Test if cookies.txt exists and is valid"""
    print("=" * 60)
    print("🍪 TEST 1: Cookie File Check")
    print("=" * 60)
    
    cookie_file = Path("cookies.txt")
    
    if not cookie_file.exists():
        print("❌ cookies.txt not found")
        print()
        print("💡 To create it, run:")
        print("   python export_cookies.py chrome")
        return False
    
    print(f"✅ cookies.txt exists")
    
    # Check file size
    size = cookie_file.stat().st_size
    print(f"📊 File size: {size:,} bytes")
    
    if size == 0:
        print("❌ Cookie file is empty!")
        return False
    
    if size < 100:
        print("⚠️  Cookie file seems too small (< 100 bytes)")
        return False
    
    # Check format
    try:
        with open(cookie_file, 'r') as f:
            first_line = f.readline().strip()
            
        if "Netscape HTTP Cookie File" in first_line or "HTTP Cookie File" in first_line:
            print(f"✅ Valid Netscape format header")
        else:
            print(f"⚠️  Unexpected header: {first_line[:50]}")
            print("   Expected: # Netscape HTTP Cookie File")
            
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        return False
    
    print("✅ Cookie file looks valid")
    return True


def test_browser_cookies():
    """Test if browser cookies are accessible"""
    print()
    print("=" * 60)
    print("🌐 TEST 2: Browser Cookie Access")
    print("=" * 60)
    
    browsers = ["chrome", "firefox", "edge"]
    accessible = []
    
    for browser in browsers:
        print(f"\n🔍 Testing {browser}...")
        
        try:
            cmd = [
                "yt-dlp",
                "--cookies-from-browser", browser,
                "--print", "title",
                "--skip-download",
                "https://www.youtube.com/watch?v=jNQXAC9IVRw"
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=15
            )
            
            if result.returncode == 0:
                print(f"   ✅ {browser} cookies accessible")
                accessible.append(browser)
            else:
                error = result.stderr[:100] if result.stderr else "Unknown error"
                print(f"   ❌ {browser} not accessible: {error}")
                
        except subprocess.TimeoutExpired:
            print(f"   ❌ {browser} timeout (>15s)")
        except FileNotFoundError:
            print(f"   ❌ yt-dlp not found")
            return False
        except Exception as e:
            print(f"   ❌ {browser} error: {e}")
    
    if accessible:
        print(f"\n✅ Accessible browsers: {', '.join(accessible)}")
        return True
    else:
        print(f"\n❌ No browsers accessible")
        return False


def test_download_with_cookies():
    """Test actual download with cookies"""
    print()
    print("=" * 60)
    print("📥 TEST 3: Download Test with Cookies")
    print("=" * 60)
    
    # Import the downloader
    try:
        from services.downloader import get_cookie_options
        print("✅ Imported downloader module")
    except ImportError as e:
        print(f"❌ Cannot import downloader: {e}")
        return False
    
    # Check cookie options
    print("\n🔧 Getting cookie options...")
    cookie_opts = get_cookie_options()
    
    if not cookie_opts:
        print("⚠️  No cookies configured (will use fallback)")
    elif "cookiefile" in cookie_opts:
        print(f"✅ Using cookie file: {cookie_opts['cookiefile']}")
    elif "cookiesfrombrowser" in cookie_opts:
        browser = cookie_opts['cookiesfrombrowser'][0]
        print(f"✅ Using browser cookies: {browser}")
    
    # Test download (metadata only, no actual download)
    print("\n📋 Testing metadata extraction...")
    test_url = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
    
    try:
        import yt_dlp
        
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
        }
        ydl_opts.update(cookie_opts)
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(test_url, download=False)
            
        print(f"✅ Successfully extracted metadata")
        print(f"   Title: {info.get('title', 'N/A')[:50]}")
        print(f"   Duration: {info.get('duration', 0)}s")
        print(f"   Uploader: {info.get('uploader', 'N/A')}")
        return True
        
    except Exception as e:
        print(f"❌ Download test failed: {e}")
        return False


def test_yt_dlp_version():
    """Check yt-dlp version"""
    print()
    print("=" * 60)
    print("🔧 TEST 4: yt-dlp Version Check")
    print("=" * 60)
    
    try:
        result = subprocess.run(
            ["yt-dlp", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            version = result.stdout.strip()
            print(f"✅ yt-dlp version: {version}")
            
            # Check if it's recent (2026.x.x)
            if version.startswith("2026"):
                print("✅ Version is up-to-date")
                return True
            else:
                print("⚠️  Version might be outdated")
                print("   Run: pip install -U yt-dlp")
                return True
        else:
            print("❌ Could not get version")
            return False
            
    except FileNotFoundError:
        print("❌ yt-dlp not installed")
        print("   Run: pip install yt-dlp")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def main():
    print()
    print("╔" + "═" * 58 + "╗")
    print("║" + " " * 10 + "🍪 Cookie Setup Test Suite" + " " * 21 + "║")
    print("╚" + "═" * 58 + "╝")
    print()
    
    results = []
    
    # Run all tests
    results.append(("yt-dlp version", test_yt_dlp_version()))
    results.append(("Cookie file", test_cookie_file()))
    results.append(("Browser cookies", test_browser_cookies()))
    results.append(("Download test", test_download_with_cookies()))
    
    # Summary
    print()
    print("=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print()
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print()
        print("🎉 All tests passed!")
        print()
        print("✅ Your cookie setup is working correctly")
        print("✅ Bot detection should be avoided")
        print("✅ Ready for production deployment")
        print()
        print("📝 Next steps:")
        print("   1. Start backend: python main.py")
        print("   2. Test video download from frontend")
        print("   3. Check logs for cookie usage confirmation")
        return 0
    else:
        print()
        print("⚠️  Some tests failed")
        print()
        print("💡 Troubleshooting:")
        
        if not results[0][1]:  # yt-dlp version
            print("   • Install yt-dlp: pip install -U yt-dlp")
        
        if not results[1][1]:  # Cookie file
            print("   • Export cookies: python export_cookies.py chrome")
        
        if not results[2][1]:  # Browser cookies
            print("   • Make sure browser is installed")
            print("   • Log into YouTube in browser")
            print("   • Try different browser")
        
        if not results[3][1]:  # Download test
            print("   • Check internet connection")
            print("   • Verify YouTube is accessible")
            print("   • Try regenerating cookies")
        
        print()
        print("📖 See COOKIE-SETUP.md for detailed troubleshooting")
        return 1


if __name__ == "__main__":
    sys.exit(main())
