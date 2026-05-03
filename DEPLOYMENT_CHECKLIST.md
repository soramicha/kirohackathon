# Render Deployment Checklist for deploy-test-angela

## Pre-Deployment Steps

- [ ] Ensure all changes are committed to the `deploy-test-angela` branch
- [ ] Push the branch to GitHub with the new deployment files:
  - [ ] `render.yaml`
  - [ ] `backend/start.sh`
  - [ ] `requirements.txt` (root)
  - [ ] `Procfile`
  - [ ] `DEPLOY_RENDER.md`

## Render Setup Steps

### Option 1: Blueprint Deployment (Recommended)
- [ ] Go to [Render Dashboard](https://dashboard.render.com/)
- [ ] Click "New" → "Blueprint"
- [ ] Connect your GitHub repository
- [ ] Select the `deploy-test-angela` branch
- [ ] Review the configuration from `render.yaml`
- [ ] Click "Apply"

### Option 2: Manual Web Service
- [ ] Go to [Render Dashboard](https://dashboard.render.com/)
- [ ] Click "New" → "Web Service"
- [ ] Connect GitHub repository
- [ ] Select `deploy-test-angela` branch
- [ ] Configure:
  - Name: `formationai-backend`
  - Runtime: `Python 3`
  - Build Command: `cd backend && pip install -r requirements.txt`
  - Start Command: `cd backend && python main.py`

## Post-Deployment Verification

- [ ] Check deployment logs for errors
- [ ] Test health endpoint: `https://your-app.onrender.com/health`
- [ ] Test API docs: `https://your-app.onrender.com/docs`
- [ ] Verify CORS is working with frontend

## Frontend Configuration

- [ ] Update frontend API base URL to point to Render deployment
- [ ] Test frontend integration with deployed backend
- [ ] Deploy frontend (Vercel, Netlify, etc.) if needed

## Performance Monitoring

- [ ] Monitor memory usage in Render dashboard
- [ ] Check response times for API endpoints
- [ ] Monitor for cold start issues (free tier)

## Production Considerations

- [ ] Consider upgrading to paid plan for better performance
- [ ] Set up proper CORS origins (not "*")
- [ ] Add authentication if needed
- [ ] Set up persistent storage for uploaded files
- [ ] Configure monitoring and alerting

## Troubleshooting

If deployment fails:
- [ ] Check build logs for dependency installation issues
- [ ] Verify Python version compatibility
- [ ] Check memory usage (YOLO models are memory-intensive)
- [ ] Consider using a paid plan for more resources

## Expected Deployment URL

Your backend will be available at:
`https://formationai-backend.onrender.com`

Update your frontend's API configuration to use this URL.