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
        print(f"\n🎬 Starting video processing...")
        print(f"📦 Video file: {video.filename}, size: {video.size if hasattr(video, 'size') else 'unknown'}")

        # Parse timestamps
        timestamp_list = json.loads(timestamps)
        print(f"⏱️  Timestamps: {timestamp_list}")

        if not isinstance(timestamp_list, list):
            raise ValueError("Timestamps must be a list")

        if len(timestamp_list) == 0:
            raise ValueError("No timestamps provided")

        # Generate unique session ID
        session_id = str(uuid.uuid4())
        print(f"🆔 Session ID: {session_id}")

        # Save uploaded video
        video_filename = f"{session_id}_full.webm"
        video_path = UPLOADS_DIR / video_filename

        print(f"💾 Saving video to: {video_path}")
        with open(video_path, "wb") as f:
            content = await video.read()
            f.write(content)

        print(f"✅ Video saved: {len(content)} bytes")

        # Create clips for each timestamp
        clip_urls = []

        for idx, timestamp in enumerate(timestamp_list, 1):
            # Create clip: 2 seconds before, 3 seconds after (5 seconds total)
            start_time = max(0, timestamp - 2)  # Don't go below 0
            duration = 5

            clip_filename = f"{session_id}_swing_{idx}.mp4"
            clip_path = CLIPS_DIR / clip_filename

            print(f"\n✂️  Creating clip {idx}/{len(timestamp_list)}")
            print(f"   Timestamp: {timestamp}s, Start: {start_time}s, Duration: {duration}s")

            # Use FFmpeg to extract clip
            success = await create_clip(
                str(video_path),
                str(clip_path),
                start_time,
                duration
            )

            if success:
                clip_urls.append(f"/api/clips/{clip_filename}")
                print(f"   ✅ Clip created: {clip_filename}")
            else:
                print(f"   ❌ Failed to create clip {idx}")

        # Clean up uploaded video (optional - comment out if you want to keep originals)
        # video_path.unlink()

        print(f"\n🎉 Processing complete! Created {len(clip_urls)} clips")

        # If no clips were created, return an error
        if len(clip_urls) == 0:
            raise HTTPException(
                status_code=500,
                detail="FFmpeg failed to create clips. Check server logs for details. Make sure FFmpeg is installed."
            )

        return JSONResponse({
            "success": True,
            "clips": clip_urls,
            "session_id": session_id
        })

    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid timestamps format: {e}")
    except Exception as e:
        print(f"❌ Error processing video: {e}")
        import traceback
        traceback.print_exc()
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
        # Check if FFmpeg is available
        try:
            subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=10)
        except FileNotFoundError:
            print(f"   ❌ FFmpeg not found! Please install FFmpeg to use video processing.")
            return False
        except Exception as e:
            print(f"   ⚠️  FFmpeg check warning: {e}")

        # FFmpeg command to extract clip
        # Using -avoid_negative_ts make_zero to handle WebM timing issues
        # Using -fflags +genpts to regenerate timestamps
        cmd = [
            "ffmpeg",
            "-ss", str(start_time),
            "-i", input_path,
            "-t", str(duration),
            "-c:v", "libx264",
            "-preset", "ultrafast",  # Faster encoding
            "-crf", "23",  # Quality setting
            "-avoid_negative_ts", "make_zero",  # Fix WebM timing issues
            "-fflags", "+genpts",  # Regenerate presentation timestamps
            "-y",
            output_path
        ]

        # Try with audio first
        print(f"   🎬 Running FFmpeg: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60  # Increased timeout for reliability
        )

        if result.returncode == 0:
            # Check if file was created
            if Path(output_path).exists():
                file_size = Path(output_path).stat().st_size
                print(f"   ✅ FFmpeg success! Output: {file_size} bytes")
                return True
            else:
                print(f"   ❌ FFmpeg returned 0 but file doesn't exist!")
                return False
        else:
            # If it failed, try without audio (some WebM files might not have audio track)
            print(f"   ⚠️  FFmpeg failed with code {result.returncode}, trying without audio...")
            print(f"   stderr: {result.stderr[:300]}")

            cmd_no_audio = [
                "ffmpeg",
                "-ss", str(start_time),
                "-i", input_path,
                "-t", str(duration),
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "23",
                "-an",  # No audio
                "-avoid_negative_ts", "make_zero",
                "-fflags", "+genpts",
                "-y",
                output_path
            ]

            print(f"   🔁 Retry without audio: {' '.join(cmd_no_audio)}")

            result2 = subprocess.run(
                cmd_no_audio,
                capture_output=True,
                text=True,
                timeout=60  # Increased timeout for reliability
            )

            if result2.returncode == 0 and Path(output_path).exists():
                file_size = Path(output_path).stat().st_size
                print(f"   ✅ FFmpeg success (no audio)! Output: {file_size} bytes")
                return True
            else:
                print(f"   ❌ FFmpeg failed again with code {result2.returncode}")
                print(f"   stderr: {result2.stderr[:500]}")
                return False

    except subprocess.TimeoutExpired:
        print(f"   ⏱️  FFmpeg timeout for clip at {start_time}s")
        return False
    except Exception as e:
        print(f"   ❌ FFmpeg error: {e}")
        import traceback
        traceback.print_exc()
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
