#!/usr/bin/env python3
"""
Production cookie setup helper.
Exports cookies and provides deployment instructions.
"""

import sys
import base64
from pathlib import Path
import subprocess


def export_cookies_for_production():
    """Export cookies and prepare for production deployment"""
    
    print("=" * 60)
    print("🚀 Production Cookie Setup")
    print("=" * 60)
    print()
    
    # Step 1: Export cookies
    print("Step 1: Exporting cookies from Chrome...")
    print()
    
    result = subprocess.run(
        [sys.executable, "export_cookies.py", "chrome"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print("❌ Cookie export failed!")
        print(result.stderr)
        return False
    
    print(result.stdout)
    
    # Step 2: Verify cookies.txt exists
    cookie_file = Path("cookies.txt")
    if not cookie_file.exists():
        print("❌ cookies.txt not created")
        return False
    
    # Step 3: Generate base64 for environment variable
    print()
    print("=" * 60)
    print("📦 Deployment Options")
    print("=" * 60)
    print()
    
    with open(cookie_file, 'rb') as f:
        cookie_content = f.read()
        cookie_b64 = base64.b64encode(cookie_content).decode('utf-8')
    
    print("Option 1: Environment Variable")
    print("-" * 60)
    print("Add this to your deployment environment:")
    print()
    print(f"YOUTUBE_COOKIES={cookie_b64}")
    print()
    print("Then in your code:")
    print("""
import os
import base64
from pathlib import Path

cookies_b64 = os.getenv("YOUTUBE_COOKIES")
if cookies_b64:
    cookies_content = base64.b64decode(cookies_b64)
    Path("cookies.txt").write_bytes(cookies_content)
""")
    print()
    
    print("Option 2: Docker Volume Mount")
    print("-" * 60)
    print("In docker-compose.yml:")
    print("""
services:
  backend:
    volumes:
      - ./secrets/cookies.txt:/app/backend/cookies.txt:ro
""")
    print()
    
    print("Option 3: Secrets Manager")
    print("-" * 60)
    print("AWS Secrets Manager:")
    print("""
aws secretsmanager create-secret \\
    --name youtube-cookies \\
    --secret-string file://cookies.txt
""")
    print()
    print("Then in your code:")
    print("""
import boto3

client = boto3.client('secretsmanager')
response = client.get_secret_value(SecretId='youtube-cookies')
Path("cookies.txt").write_text(response['SecretString'])
""")
    print()
    
    # Step 4: Security reminders
    print("=" * 60)
    print("🔒 Security Checklist")
    print("=" * 60)
    print()
    print("✓ Never commit cookies.txt to git")
    print("✓ Add cookies.txt to .gitignore (already done)")
    print("✓ Use environment variables or secrets manager")
    print("✓ Set file permissions: chmod 600 cookies.txt")
    print("✓ Regenerate cookies every 30 days")
    print("✓ Use separate YouTube account for automation")
    print()
    
    # Step 5: Testing
    print("=" * 60)
    print("🧪 Testing")
    print("=" * 60)
    print()
    print("Test locally before deploying:")
    print()
    print("1. Start backend:")
    print("   python main.py")
    print()
    print("2. Test download:")
    print("   curl -X POST http://localhost:8000/video/process \\")
    print("     -H 'Content-Type: application/json' \\")
    print("     -d '{\"url\": \"https://www.youtube.com/watch?v=jNQXAC9IVRw\"}'")
    print()
    print("3. Check logs for:")
    print("   [downloader] Using cookie file: cookies.txt")
    print()
    
    return True


def check_current_setup():
    """Check if cookies are already working"""
    
    print("=" * 60)
    print("🔍 Current Setup Check")
    print("=" * 60)
    print()
    
    cookie_file = Path("cookies.txt")
    
    if cookie_file.exists():
        size = cookie_file.stat().st_size
        print(f"✅ cookies.txt exists ({size:,} bytes)")
        print()
        print("Your production cookies are ready!")
        print()
        print("Next steps:")
        print("1. Choose deployment method (see above)")
        print("2. Deploy cookies securely")
        print("3. Test in production")
        print()
        return True
    else:
        print("❌ cookies.txt not found")
        print()
        print("Run this script to create production cookies:")
        print("   python setup_production_cookies.py")
        print()
        return False


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "check":
        check_current_setup()
    else:
        if not export_cookies_for_production():
            sys.exit(1)
        
        print("=" * 60)
        print("✅ Production Setup Complete!")
        print("=" * 60)
        print()
        print("Your cookies.txt is ready for deployment.")
        print()
        print("📖 See COOKIE-SETUP.md for detailed deployment guides")
        print("📊 See COOKIE-STATUS.md for current setup status")
        print()


if __name__ == "__main__":
    main()
