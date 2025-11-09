# Swingcam

A simple web application for recording and analyzing swing videos. Record your swings, automatically detect impact sounds, and review clips side-by-side.

## Features

- **Browser-based**: No app installation required
- **Automatic detection**: Detects swing impacts from audio
- **Instant clips**: Creates 5-second clips centered on each swing
- **Side-by-side comparison**: Review multiple swings together
- **Simple deployment**: One-click deploy to Railway

## How It Works

1. Open the Swingcam website
2. Grant camera and microphone permissions
3. Press "Start Recording"
4. Take your swings (the app detects the "wack" sound)
5. Press "Stop Recording"
6. Wait a few seconds while clips are processed
7. Review and compare your swing clips

## Deploying to Railway

### Prerequisites

- A Railway account (sign up at [railway.app](https://railway.app))
- This GitHub repository

### Deployment Steps

1. **Create a new Railway project**
   - Go to [railway.app/new](https://railway.app/new)
   - Select "Deploy from GitHub repo"
   - Choose this repository

2. **Add a Volume (for persistent storage)**
   - In your Railway project, click on your service
   - Go to the "Data" tab
   - Click "New Volume"
   - Mount path: `/data`
   - Size: 1GB (or more if you expect many videos)

3. **Set environment variables**
   - Go to the "Variables" tab
   - Add: `DATA_DIR=/data`
   - Railway automatically sets `PORT` (no action needed)

4. **Deploy**
   - Railway will automatically detect the Python app
   - It will install FFmpeg (via nixpacks.toml)
   - Your app will be live in ~2 minutes

5. **Access your app**
   - Railway will provide a public URL (e.g., `your-app.railway.app`)
   - Open it in your browser and start recording!

## Local Development

### Prerequisites

- Python 3.11+
- FFmpeg installed (required for video processing)

### Installing FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) or use Chocolatey:
```bash
choco install ffmpeg
```

**Verify installation:**
```bash
ffmpeg -version
```

### Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Create data directories
mkdir -p data/uploads data/clips

# Run the server
python main.py
```

Visit `http://localhost:8000` in your browser.

**Important:** Make sure FFmpeg is installed and available in your PATH, otherwise video processing will fail!

## Technical Stack

- **Backend**: Python + FastAPI
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Video Processing**: FFmpeg
- **Storage**: Railway Volume (persistent file storage)

## Project Structure

```
/
├── main.py              # FastAPI backend
├── requirements.txt     # Python dependencies
├── nixpacks.toml       # Railway/Nixpacks configuration
├── static/
│   ├── index.html      # Frontend UI
│   ├── style.css       # Styles
│   └── app.js          # Recording and audio detection logic
├── data/               # Storage (Railway Volume mounts here)
│   ├── uploads/        # Full uploaded videos
│   └── clips/          # Processed swing clips
└── README.md
```

## API Endpoints

- `GET /` - Serve the frontend
- `POST /api/process` - Upload video and timestamps, get back clips
- `GET /api/clips/{filename}` - Serve a processed clip
- `DELETE /api/sessions/{session_id}` - Clean up session files
- `GET /health` - Health check

## How Detection Works

The frontend uses the Web Audio API to analyze the microphone input in real-time:

1. Audio is analyzed using FFT (Fast Fourier Transform)
2. Sudden increases in volume above a threshold are detected
3. These timestamps are recorded as potential swings
4. When recording stops, timestamps are sent to the backend
5. Backend uses FFmpeg to extract 5-second clips (2s before, 3s after each timestamp)

## Troubleshooting

### No clips are created
- Check that your swings are loud enough (adjust the threshold in app.js)
- Ensure microphone permissions are granted
- Check Railway logs for FFmpeg errors

### Videos don't play
- Ensure your browser supports WebM/MP4 formats
- Check Railway Volume is properly mounted at `/data`
- Verify FFmpeg is installed (check deploy logs)

### Storage issues
- Increase Railway Volume size if needed
- Implement cleanup (delete old sessions)
- Consider adding a cron job to delete files older than 24 hours

## Future Enhancements

- User accounts and session history
- Advanced swing comparison tools (slow motion, overlay)
- Mobile-optimized UI
- Adjustable clip duration
- Export clips to device
- Share clips via link

## License

MIT License - feel free to modify and use for your own projects!
