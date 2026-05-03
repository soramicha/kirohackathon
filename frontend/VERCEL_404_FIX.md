# Fixing Vercel 404 Errors for React SPA

## The Problem

When deploying a React Single Page Application (SPA) to Vercel, you might encounter 404 errors when:
- Refreshing the page on any route other than `/`
- Directly accessing URLs like `https://your-app.vercel.app/formations`
- Navigating with browser back/forward buttons

## The Solution

I've added the necessary configuration files to fix this issue:

### 1. vercel.json (Primary Fix)

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This tells Vercel to serve `index.html` for ALL routes, allowing React to handle client-side routing.

### 2. public/_redirects (Backup Fix)

```
/*    /index.html   200
```

This is a fallback configuration that also ensures all routes serve the main HTML file.

## Deployment Steps to Fix 404

### If You Already Have a Vercel Project:

1. **Add the configuration files** (already done):
   - `frontend/vercel.json`
   - `frontend/public/_redirects`

2. **Redeploy your project**:
   - Push changes to your `deploy-test-angela` branch
   - Vercel will automatically redeploy
   - Or manually trigger a redeploy in Vercel dashboard

### If Creating a New Vercel Project:

1. **Go to Vercel Dashboard**
2. **Import Project** from GitHub
3. **Configure Settings**:
   - Framework Preset: **Vite**
   - Root Directory: **frontend**
   - Build Command: **npm run build**
   - Output Directory: **dist**

4. **Deploy**

## Verification Steps

After deployment, test these scenarios:

1. ✅ **Home page loads**: `https://your-app.vercel.app/`
2. ✅ **Direct URL access**: Navigate directly to any route
3. ✅ **Page refresh**: Refresh the browser on any route
4. ✅ **Browser navigation**: Use back/forward buttons

All should work without 404 errors.

## Additional Configuration

### Environment Variables

Set in Vercel Dashboard → Project Settings → Environment Variables:

```
VITE_API_URL=https://your-backend.onrender.com
```

### Build Settings

Verify these settings in Vercel:
- **Framework Preset**: Vite
- **Root Directory**: frontend
- **Build Command**: npm run build
- **Output Directory**: dist
- **Install Command**: npm install

## Common Issues and Solutions

### Issue: Still getting 404 after configuration
**Solution**: 
- Clear Vercel cache and redeploy
- Check that `vercel.json` is in the root of your frontend directory
- Verify the configuration syntax is correct

### Issue: API calls failing
**Solution**:
- Set `VITE_API_URL` environment variable
- Update backend CORS to allow Vercel domain
- Check network tab for actual error messages

### Issue: Build failing
**Solution**:
- Check build logs in Vercel dashboard
- Verify all dependencies are in `package.json`
- Test build locally: `npm run build`

### Issue: Assets not loading
**Solution**:
- Check that assets are in `public/` directory
- Verify asset paths don't have leading `/` when not needed
- Check browser console for 404s on specific assets

## Manual Deployment Commands

If using Vercel CLI:

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to frontend directory
cd frontend

# Deploy
vercel --prod

# Set environment variables
vercel env add VITE_API_URL production
```

## Success Indicators

Your deployment is successful when:
- ✅ No 404 errors on any route
- ✅ Page refreshes work everywhere
- ✅ Direct URL access works
- ✅ API calls connect to backend
- ✅ All assets load properly

The configuration files I've added should resolve the 404 issue completely!