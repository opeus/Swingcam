# Railway Deployment Guide

This guide will walk you through deploying Swingcam to Railway in just a few minutes.

## Prerequisites

- A GitHub account
- A Railway account (free tier is fine!) - Sign up at [railway.app](https://railway.app)

## Step-by-Step Deployment

### 1. Push Code to GitHub

If you haven't already, push this repository to GitHub:

```bash
git add .
git commit -m "Initial Swingcam implementation"
git push origin main
```

### 2. Create a New Railway Project

1. Go to [railway.app/new](https://railway.app/new)
2. Click **"Deploy from GitHub repo"**
3. Authorize Railway to access your GitHub account
4. Select the **Swingcam** repository
5. Click **"Deploy Now"**

Railway will automatically:
- Detect the Python application
- Install dependencies from `requirements.txt`
- Install FFmpeg (via `nixpacks.toml`)
- Start the FastAPI server

### 3. Add a Volume for Storage

Since we need persistent storage for uploaded videos and clips:

1. In your Railway project dashboard, click on your service
2. Go to the **"Data"** tab (or click **"+ New"** → **"Volume"**)
3. Click **"New Volume"**
4. Configure the volume:
   - **Name**: `swingcam-storage` (or any name you like)
   - **Mount Path**: `/data`
   - **Size**: Start with **1 GB** (you can increase later)
5. Click **"Add"**

### 4. Set Environment Variables

1. In your service, go to the **"Variables"** tab
2. Add the following variable:
   - **Key**: `DATA_DIR`
   - **Value**: `/data`
3. Click **"Add"**

**Note**: Railway automatically sets the `PORT` variable, so you don't need to add it.

### 5. Deploy

1. Railway will automatically redeploy with the new configuration
2. Wait 1-2 minutes for the deployment to complete
3. Once deployed, Railway will provide a public URL like `your-app.up.railway.app`

### 6. Test Your App

1. Click on the provided URL
2. Grant camera and microphone permissions when prompted
3. Start recording and take a few swings!

## Troubleshooting

### Videos not processing

**Check logs:**
1. Go to your service in Railway
2. Click the **"Deployments"** tab
3. Click the latest deployment
4. Check the logs for FFmpeg errors

**Common fixes:**
- Ensure the Volume is mounted at `/data`
- Verify `DATA_DIR=/data` is set in environment variables
- Check that FFmpeg was installed (look for it in build logs)

### Camera/microphone not accessible

- Make sure you're accessing the site via HTTPS (Railway provides this by default)
- Check browser permissions for camera and microphone
- Try a different browser (Chrome and Edge work best)

### "No swings detected"

- Increase the volume threshold in `static/app.js` (line 25: `threshold`)
- Make sure the microphone can clearly hear the swing impact
- Try clapping loudly to test detection

### Out of storage

- Increase the Volume size in Railway
- Implement cleanup (delete old sessions)
- Add a cron job to remove files older than 24 hours

## Upgrading

To deploy updates:

```bash
git add .
git commit -m "Your update message"
git push origin main
```

Railway will automatically detect the changes and redeploy.

## Monitoring

### View Logs

Railway provides real-time logs:
1. Go to your service
2. Click **"Deployments"**
3. Select the active deployment
4. View logs in real-time

### Check Storage Usage

1. Go to the **"Data"** tab
2. View current storage usage
3. Increase size if needed

## Cost Estimation

**Free Tier:**
- Railway offers $5/month free credit
- Typical usage: ~$2-3/month for a small app
- Includes compute + storage

**If you exceed free tier:**
- Compute: ~$0.01 per hour
- Storage: ~$0.25/GB per month
- Bandwidth: Usually free for small projects

## Advanced Configuration

### Custom Domain

1. Go to **"Settings"** → **"Domains"**
2. Click **"Custom Domain"**
3. Follow the instructions to point your domain to Railway

### Automatic Cleanup

Add a cleanup endpoint that runs daily to delete old files:

```python
# Add to main.py
@app.delete("/api/cleanup")
async def cleanup_old_files():
    """Delete files older than 24 hours"""
    import time
    cutoff = time.time() - (24 * 60 * 60)

    for f in UPLOADS_DIR.glob("*"):
        if f.stat().st_mtime < cutoff:
            f.unlink()

    for f in CLIPS_DIR.glob("*"):
        if f.stat().st_mtime < cutoff:
            f.unlink()

    return {"cleaned": True}
```

Then use Railway's cron feature to call this endpoint daily.

### Environment-Specific Settings

For development vs production:

```python
import os

DEBUG = os.getenv("DEBUG", "false").lower() == "true"
```

## Support

If you encounter issues:

1. Check Railway's [documentation](https://docs.railway.app)
2. Review the logs for error messages
3. Open an issue on the GitHub repository
4. Join Railway's [Discord community](https://discord.gg/railway)

## Next Steps

Once deployed, consider:

- Adding user authentication
- Implementing session history
- Adding video sharing features
- Creating a mobile-optimized view
- Adding analytics to track usage

---

**You're all set!** Your Swingcam app should now be live and ready to use. Share the URL with friends and start analyzing swings!
