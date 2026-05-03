# Deploying FormationAI Frontend to Vercel

This guide will help you deploy the FormationAI frontend to Vercel using the `deploy-test-angela` branch.

## Files Added for Deployment

- `vercel.json` - Main Vercel configuration
- `public/_redirects` - Backup redirect configuration
- Updated `index.html` - Better title and meta tags

## Deployment Steps

### Option 1: Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard**:
   - Visit [vercel.com](https://vercel.com)
   - Sign in with your GitHub account

2. **Import Project**:
   - Click "New Project"
   - Import your GitHub repository
   - Select the `deploy-test-angela` branch

3. **Configure Project**:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. **Environment Variables** (if needed):
   - Add any environment variables your app needs
   - Example: `VITE_API_BASE_URL=https://your-backend.onrender.com`

5. **Deploy**:
   - Click "Deploy"
   - Wait for the build to complete

### Option 2: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to frontend directory
cd frontend

# Deploy
vercel

# Follow the prompts:
# - Set up and deploy? Y
# - Which scope? (your account)
# - Link to existing project? N
# - Project name: formationai-frontend
# - Directory: ./
# - Override settings? N
```

## Configuration Details

### vercel.json Configuration

The `vercel.json` file handles:
- **SPA Routing**: All routes redirect to `index.html`
- **CORS Headers**: Proper headers for API calls
- **Static File Serving**: Optimized for React SPA

### Build Configuration

- **Framework**: Vite (auto-detected)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node Version**: 18.x (default)

## Environment Variables

If your frontend needs to connect to a deployed backend:

```bash
# Add in Vercel dashboard or via CLI
VITE_API_BASE_URL=https://your-backend.onrender.com
```

Then update your `src/api.js`:

```javascript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
```

## Troubleshooting

### Common Issues:

1. **404 on Refresh**:
   - ✅ Fixed by `vercel.json` rewrites
   - Ensures all routes serve `index.html`

2. **Build Failures**:
   - Check Node.js version compatibility
   - Verify all dependencies are in `package.json`
   - Check build logs in Vercel dashboard

3. **API Connection Issues**:
   - Verify backend URL is correct
   - Check CORS configuration on backend
   - Ensure environment variables are set

4. **Static Assets Not Loading**:
   - Verify `public/` directory structure
   - Check asset paths in code
   - Ensure build output is correct

### Build Optimization

For better performance:

1. **Enable Vercel Analytics**:
   ```bash
   npm install @vercel/analytics
   ```

2. **Add to main.jsx**:
   ```javascript
   import { Analytics } from '@vercel/analytics/react';
   
   // Add <Analytics /> to your app
   ```

3. **Optimize Bundle Size**:
   - Use dynamic imports for large components
   - Enable tree shaking
   - Optimize images

## Custom Domain (Optional)

1. **Add Domain in Vercel**:
   - Go to Project Settings → Domains
   - Add your custom domain
   - Follow DNS configuration instructions

2. **SSL Certificate**:
   - Automatically provided by Vercel
   - No additional configuration needed

## Monitoring and Analytics

- **Vercel Analytics**: Built-in performance monitoring
- **Error Tracking**: Check Function Logs in dashboard
- **Performance**: Monitor Core Web Vitals

## Production Checklist

- [ ] Frontend builds successfully
- [ ] All routes work (no 404s)
- [ ] API calls work with deployed backend
- [ ] Environment variables are set
- [ ] Custom domain configured (if needed)
- [ ] Analytics enabled (optional)
- [ ] Error monitoring set up

## Expected URLs

- **Frontend**: `https://your-project.vercel.app`
- **Custom Domain**: `https://your-domain.com` (if configured)

## Integration with Backend

Make sure your backend (deployed on Render) allows your Vercel domain in CORS:

```python
# In backend/main.py
allowed_origins = [
    "https://your-project.vercel.app",
    "https://your-domain.com",  # if using custom domain
    "http://localhost:5173",    # for development
]
```