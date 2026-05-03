/**
 * Extract YouTube cookies from the user's browser for video downloading
 */

export async function extractYouTubeCookies() {
  try {
    // Get all cookies for youtube.com domain
    const cookies = document.cookie
      .split(';')
      .map(cookie => cookie.trim())
      .filter(cookie => cookie.length > 0);

    // Check if user is signed into YouTube by looking for common auth cookies
    const hasYouTubeAuth = cookies.some(cookie => 
      cookie.startsWith('SAPISID=') || 
      cookie.startsWith('HSID=') || 
      cookie.startsWith('SSID=') ||
      cookie.startsWith('APISID=')
    );

    if (!hasYouTubeAuth) {
      return null;
    }

    // Format cookies for backend (Netscape format)
    const netscapeCookies = formatCookiesForBackend(cookies);
    
    return {
      cookies: netscapeCookies,
      hasAuth: hasYouTubeAuth,
      timestamp: Date.now()
    };

  } catch (error) {
    console.error('Failed to extract YouTube cookies:', error);
    return null;
  }
}

function formatCookiesForBackend(cookies) {
  // Convert browser cookies to Netscape format for yt-dlp
  const netscapeHeader = '# Netscape HTTP Cookie File\n';
  const cookieLines = cookies.map(cookie => {
    const [name, value] = cookie.split('=');
    if (!name || !value) return null;
    
    // Format: domain	flag	path	secure	expiration	name	value
    const domain = '.youtube.com';
    const flag = 'TRUE';
    const path = '/';
    const secure = 'TRUE';
    const expiration = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days from now
    
    return `${domain}\t${flag}\t${path}\t${secure}\t${expiration}\t${name.trim()}\t${value.trim()}`;
  }).filter(Boolean);

  return netscapeHeader + cookieLines.join('\n');
}

export async function checkYouTubeAuthStatus() {
  try {
    // Try to fetch YouTube to see if user is authenticated
    const response = await fetch('https://www.youtube.com/feed/subscriptions', {
      method: 'HEAD',
      credentials: 'include'
    });
    
    // If we get redirected to sign-in, user is not authenticated
    return !response.url.includes('/accounts/');
  } catch (error) {
    // CORS will block this, but we can still check cookies
    return extractYouTubeCookies().then(result => result?.hasAuth || false);
  }
}

export function promptUserForYouTubeSignIn() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: system-ui, -apple-system, sans-serif;
      ">
        <div style="
          background: white;
          padding: 2rem;
          border-radius: 8px;
          max-width: 500px;
          text-align: center;
        ">
          <h3 style="margin-top: 0; color: #333;">YouTube Authentication Required</h3>
          <p style="color: #666; line-height: 1.5;">
            To download YouTube videos, you need to be signed into YouTube. 
            This allows us to use your authentication to bypass bot detection.
          </p>
          <div style="margin: 1.5rem 0;">
            <button id="openYouTube" style="
              background: #ff0000;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 4px;
              cursor: pointer;
              margin-right: 10px;
              font-size: 14px;
            ">
              Sign in to YouTube
            </button>
            <button id="checkAuth" style="
              background: #4285f4;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            ">
              I'm already signed in
            </button>
          </div>
          <button id="skipAuth" style="
            background: transparent;
            color: #666;
            border: 1px solid #ddd;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          ">
            Skip (may fail for some videos)
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#openYouTube').onclick = () => {
      window.open('https://www.youtube.com/account', '_blank');
    };

    modal.querySelector('#checkAuth').onclick = async () => {
      const cookies = await extractYouTubeCookies();
      document.body.removeChild(modal);
      resolve(cookies);
    };

    modal.querySelector('#skipAuth').onclick = () => {
      document.body.removeChild(modal);
      resolve(null);
    };
  });
}