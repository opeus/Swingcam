"""
Swingcam - Simple swing video analysis tool
FastAPI backend for video upload, processing, and serving
"""

import os
import subprocess
import uuid
from pathlib import Path
from typing import List
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import json

app = FastAPI(title="Swingcam")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage configuration
# Use Railway Volume if DATA_DIR env var is set, otherwise use local ./data
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
UPLOADS_DIR = DATA_DIR / "uploads"
CLIPS_DIR = DATA_DIR / "clips"

# Create directories if they don't exist
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
CLIPS_DIR.mkdir(parents=True, exist_ok=True)

# Serve static files (frontend)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    """Serve the main page"""
    return FileResponse("static/index.html")


@app.get("/health")
async def health():
    """Health check endpoint for Railway"""
    return {"status": "healthy"}


@app.post("/api/process")
async def process_video(
    video: UploadFile = File(...),
    timestamps: str = Form(...)
):
    """
    Process uploaded video and create clips at specified timestamps

    Args:
        video: The recorded video file
        timestamps: JSON string of timestamps in seconds (e.g., "[8.5, 22.3, 40.1]")

    Returns:
        JSON with list of clip URLs
    """
    try:
        # Parse timestamps
        timestamp_list = json.loads(timestamps)
        if not isinstance(timestamp_list, list):
            raise ValueError("Timestamps must be a list")

        # Generate unique session ID
        session_id = str(uuid.uuid4())

        # Save uploaded video
        video_filename = f"{session_id}_full.webm"
        video_path = UPLOADS_DIR / video_filename

        with open(video_path, "wb") as f:
            content = await video.read()
            f.write(content)

        # Create clips for each timestamp
        clip_urls = []

        for idx, timestamp in enumerate(timestamp_list, 1):
            # Create clip: 2 seconds before, 3 seconds after (5 seconds total)
            start_time = max(0, timestamp - 2)  # Don't go below 0
            duration = 5

            clip_filename = f"{session_id}_swing_{idx}.mp4"
            clip_path = CLIPS_DIR / clip_filename

            # Use FFmpeg to extract clip
            success = await create_clip(
                str(video_path),
                str(clip_path),
                start_time,
                duration
            )

            if success:
                clip_urls.append(f"/api/clips/{clip_filename}")
            else:
                print(f"Warning: Failed to create clip {idx}")

        # Clean up uploaded video (optional - comment out if you want to keep originals)
        # video_path.unlink()

        return JSONResponse({
            "success": True,
            "clips": clip_urls,
            "session_id": session_id
        })

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid timestamps format")
    except Exception as e:
        print(f"Error processing video: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def create_clip(input_path: str, output_path: str, start_time: float, duration: float) -> bool:
    """
    Use FFmpeg to extract a clip from the video

    Args:
        input_path: Path to input video
        output_path: Path to save output clip
        start_time: Start time in seconds
        duration: Duration in seconds

    Returns:
        True if successful, False otherwise
    """
    try:
        # FFmpeg command to extract clip
        # -ss: start time
        # -t: duration
        # -i: input file
        # -c:v libx264: encode with H.264
        # -c:a aac: encode audio with AAC
        # -y: overwrite output file
        cmd = [
            "ffmpeg",
            "-ss", str(start_time),
            "-i", input_path,
            "-t", str(duration),
            "-c:v", "libx264",
            "-c:a", "aac",
            "-preset", "fast",
            "-y",
            output_path
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )

        return result.returncode == 0

    except subprocess.TimeoutExpired:
        print(f"FFmpeg timeout for clip at {start_time}s")
        return False
    except Exception as e:
        print(f"FFmpeg error: {e}")
        return False


@app.get("/api/clips/{clip_filename}")
async def serve_clip(clip_filename: str):
    """Serve a processed video clip"""
    clip_path = CLIPS_DIR / clip_filename

    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")

    return FileResponse(
        clip_path,
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600"
        }
    )


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete all files for a session (cleanup)"""
    try:
        # Delete uploaded video
        for video_file in UPLOADS_DIR.glob(f"{session_id}_*"):
            video_file.unlink()

        # Delete clips
        for clip_file in CLIPS_DIR.glob(f"{session_id}_*"):
            clip_file.unlink()

        return {"success": True, "message": "Session deleted"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
