# Deploying FormationAI Backend to Render

This guide will help you deploy the FormationAI backend to Render using the `deploy-test-angela` branch.

## Prerequisites

1. A Render account (free tier available)
2. Your GitHub repository connected to Render
3. The `deploy-test-angela` branch pushed to GitHub

## Deployment Options

### Option 1: Using render.yaml (Recommended)

1. **Connect Repository to Render**:
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Select the `deploy-test-angela` branch
   - Render will automatically detect the `render.yaml` file

2. **Configuration**:
   - The `render.yaml` file is already configured with:
     - Python runtime
     - Build command: `cd backend && pip install -r requirements.txt`
     - Start command: `cd backend && python main.py`
     - Health check endpoint: `/health`
     - Port: 10000 (Render's default)

### Option 2: Manual Web Service Setup

1. **Create New Web Service**:
   - Go to Render Dashboard
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Select the `deploy-test-angela` branch

2. **Configure Service**:
   - **Name**: `formationai-backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `cd backend && pip install -r requirements.txt`
   - **Start Command**: `cd backend && python main.py`
   - **Plan**: Free (or paid for better performance)

3. **Environment Variables**:
   - `PORT`: `10000` (automatically set by Render)
   - `PYTHON_VERSION`: `3.11.0`

## Important Notes

### Dependencies
The backend requires several heavy dependencies:
- **PyTorch**: For YOLO model inference
- **OpenCV**: For video processing
- **Ultralytics**: For YOLO v11 models
- **yt-dlp**: For video downloading

### Performance Considerations
- **Free Tier Limitations**: 
  - 512MB RAM (may not be sufficient for YOLO models)
  - CPU-only inference (slower than GPU)
  - Service spins down after 15 minutes of inactivity

- **Recommended for Production**:
  - Use a paid plan with more RAM (2GB+ recommended)
  - Consider using Render's GPU instances for better performance

### File Storage
- Render's ephemeral filesystem means uploaded videos and generated formations are temporary
- Consider integrating with cloud storage (AWS S3, Google Cloud Storage) for persistence

## Testing the Deployment

1. **Health Check**: Visit `https://your-app-name.onrender.com/health`
2. **API Documentation**: Visit `https://your-app-name.onrender.com/docs`

## Frontend Configuration

Update your frontend's API base URL to point to the deployed backend:

```javascript
// In frontend/src/api.js or similar
const API_BASE_URL = 'https://your-app-name.onrender.com';
```

## Troubleshooting

### Common Issues:

1. **Build Timeout**: 
   - Heavy dependencies may cause build timeouts on free tier
   - Solution: Use a paid plan or optimize dependencies

2. **Memory Issues**:
   - YOLO models require significant RAM
   - Solution: Upgrade to a plan with more memory

3. **Cold Starts**:
   - Free tier services spin down when inactive
   - First request after inactivity will be slow
   - Solution: Use a paid plan or implement keep-alive pings

### Logs and Debugging:
- Check Render's logs in the dashboard for deployment issues
- Use the `/health` endpoint to verify the service is running
- Monitor memory usage in Render's metrics

## Alternative Deployment Platforms

If Render doesn't work well due to resource constraints, consider:
- **Railway**: Similar to Render with potentially better free tier
- **Fly.io**: Good for containerized deployments
- **Google Cloud Run**: Pay-per-use serverless option
- **AWS Lambda**: For serverless deployment (requires modifications)

## Security Notes

- The current CORS configuration allows all origins (`*`)
- For production, update CORS to only allow your frontend domain
- Consider adding authentication for API endpoints
- Use environment variables for sensitive configuration