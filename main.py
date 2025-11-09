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
            # Create clip: 1 second before, 1 second after (2 seconds total)
            start_time = max(0, timestamp - 1)  # Don't go below 0
            duration = 2

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
    """Serve a processed video clip or frame image"""
    clip_path = CLIPS_DIR / clip_filename

    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")

    # Determine media type based on file extension
    if clip_filename.endswith('.jpg') or clip_filename.endswith('.jpeg'):
        media_type = "image/jpeg"
    elif clip_filename.endswith('.png'):
        media_type = "image/png"
    else:
        media_type = "video/mp4"

    return FileResponse(
        clip_path,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600"
        }
    )


@app.post("/api/compare")
async def create_comparison(clips: str = Form(...)):
    """
    Create a side-by-side comparison video from multiple clips

    Args:
        clips: JSON string of clip filenames to compare (2-3 clips)

    Returns:
        URL to the combined comparison video
    """
    try:
        print(f"\n🎬 Creating comparison video")
        print(f"📋 Received clips parameter: {clips}")
        print(f"📋 Clips type: {type(clips)}")

        # Parse clips list from JSON string
        clip_list = json.loads(clips)
        print(f"📋 Parsed clip list: {clip_list}")

        if not isinstance(clip_list, list):
            raise HTTPException(status_code=400, detail="Clips must be a list")

        if len(clip_list) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 clips to compare")
        if len(clip_list) > 3:
            raise HTTPException(status_code=400, detail="Maximum 3 clips for comparison")

        # Verify all clips exist
        clip_paths = []
        for clip_filename in clip_list:
            # Extract just the filename if it's a full path
            if '/' in clip_filename:
                clip_filename = clip_filename.split('/')[-1]

            clip_path = CLIPS_DIR / clip_filename
            print(f"   🔍 Looking for clip: {clip_path}")

            if not clip_path.exists():
                print(f"   ❌ Clip not found: {clip_path}")
                print(f"   📂 CLIPS_DIR contents: {list(CLIPS_DIR.glob('*'))}")
                raise HTTPException(status_code=404, detail=f"Clip not found: {clip_filename}")

            clip_paths.append(str(clip_path))
            print(f"   ✅ Found clip: {clip_path}")

        # Generate output filename
        comparison_id = str(uuid.uuid4())
        output_filename = f"comparison_{comparison_id}.mp4"
        output_path = CLIPS_DIR / output_filename

        print(f"   💾 Output will be: {output_path}")

        # Create side-by-side video using FFmpeg
        success = await create_sidebyside_video(clip_paths, str(output_path))

        if not success:
            raise HTTPException(status_code=500, detail="Failed to create comparison video")

        print(f"✅ Comparison video created: {output_filename}")

        return JSONResponse({
            "success": True,
            "comparison_url": f"/api/clips/{output_filename}"
        })

    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        print(f"   Raw clips value: {clips}")
        raise HTTPException(status_code=400, detail=f"Invalid clips format: {e}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error creating comparison: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/compare/overlay")
async def create_overlay_comparison(clips: str = Form(...)):
    """
    Create an overlay comparison video with 50% transparency

    Args:
        clips: JSON string of exactly 2 clip filenames

    Returns:
        URL to the overlay comparison video
    """
    try:
        print(f"\n🎭 Creating overlay comparison")
        clip_list = json.loads(clips)

        if len(clip_list) != 2:
            raise HTTPException(status_code=400, detail="Overlay requires exactly 2 clips")

        # Verify clips exist
        clip_paths = []
        for clip_filename in clip_list:
            if '/' in clip_filename:
                clip_filename = clip_filename.split('/')[-1]
            clip_path = CLIPS_DIR / clip_filename
            if not clip_path.exists():
                raise HTTPException(status_code=404, detail=f"Clip not found: {clip_filename}")
            clip_paths.append(str(clip_path))

        # Generate output filename
        comparison_id = str(uuid.uuid4())
        output_filename = f"overlay_{comparison_id}.mp4"
        output_path = CLIPS_DIR / output_filename

        # Create overlay video
        success = await create_overlay_video(clip_paths, str(output_path))

        if not success:
            raise HTTPException(status_code=500, detail="Failed to create overlay video")

        print(f"✅ Overlay video created: {output_filename}")

        return JSONResponse({
            "success": True,
            "comparison_url": f"/api/clips/{output_filename}"
        })

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error creating overlay: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/compare/position")
async def create_position_comparison(clips: str = Form(...)):
    """
    Create position comparison with 10 still frames from each video

    Args:
        clips: JSON string of exactly 2 clip filenames

    Returns:
        URLs to the 10 frame pairs
    """
    try:
        print(f"\n📸 Creating position comparison")
        clip_list = json.loads(clips)

        if len(clip_list) != 2:
            raise HTTPException(status_code=400, detail="Position compare requires exactly 2 clips")

        # Verify clips exist
        clip_paths = []
        for clip_filename in clip_list:
            if '/' in clip_filename:
                clip_filename = clip_filename.split('/')[-1]
            clip_path = CLIPS_DIR / clip_filename
            if not clip_path.exists():
                raise HTTPException(status_code=404, detail=f"Clip not found: {clip_filename}")
            clip_paths.append(str(clip_path))

        # Generate unique ID for this comparison
        comparison_id = str(uuid.uuid4())

        # Extract frames
        frames = await extract_position_frames(clip_paths, comparison_id)

        if not frames:
            raise HTTPException(status_code=500, detail="Failed to extract frames")

        print(f"✅ Position comparison created: {len(frames)} frame pairs")

        return JSONResponse({
            "success": True,
            "frames": frames
        })

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error creating position comparison: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


async def create_overlay_video(clip_paths: List[str], output_path: str) -> bool:
    """
    Create overlay video with second clip at 50% transparency

    Args:
        clip_paths: List of exactly 2 clip paths
        output_path: Path to save output video

    Returns:
        True if successful
    """
    try:
        # Overlay filter: second video on top with 50% transparency
        filter_complex = "[1:v]format=yuva420p,colorchannelmixer=aa=0.5[v1];[0:v][v1]overlay[v]"
        audio_mix = "[0:a][1:a]amerge=inputs=2[a]"

        cmd = [
            "ffmpeg",
            "-i", clip_paths[0],
            "-i", clip_paths[1],
            "-filter_complex", f"{filter_complex};{audio_mix}",
            "-map", "[v]",
            "-map", "[a]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-ac", "2",
            "-y",
            output_path
        ]

        print(f"   🎬 Running FFmpeg overlay: {' '.join(cmd)}")

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode == 0 and Path(output_path).exists():
            print(f"   ✅ Overlay created! Size: {Path(output_path).stat().st_size} bytes")
            return True
        else:
            print(f"   ❌ FFmpeg failed: {result.stderr[:500]}")
            return False

    except Exception as e:
        print(f"   ❌ Overlay error: {e}")
        return False


async def extract_position_frames(clip_paths: List[str], comparison_id: str) -> List[dict]:
    """
    Extract 10 evenly-spaced frames from each video

    Args:
        clip_paths: List of exactly 2 clip paths
        comparison_id: Unique ID for this comparison

    Returns:
        List of frame pair dictionaries
    """
    try:
        frames = []

        # Extract 10 frames evenly distributed through the 2-second video
        # At positions: 0.0s, 0.22s, 0.44s, 0.67s, 0.89s, 1.11s, 1.33s, 1.56s, 1.78s, 2.0s
        for frame_num in range(10):
            # Calculate timestamp (0% to 100% through 2-second video)
            timestamp = (frame_num / 9.0) * 2.0  # 2 seconds duration

            frame_pairs = []

            for clip_idx, clip_path in enumerate(clip_paths):
                output_filename = f"frame_{comparison_id}_clip{clip_idx}_f{frame_num}.jpg"
                output_path = CLIPS_DIR / output_filename

                print(f"   📸 Extracting frame {frame_num + 1}/10 at {timestamp:.2f}s from clip {clip_idx}")

                # Extract frame at specific timestamp
                # Using -vf scale to maintain aspect ratio
                cmd = [
                    "ffmpeg",
                    "-i", clip_path,
                    "-ss", str(timestamp),  # Seek to timestamp
                    "-vframes", "1",  # Extract 1 frame
                    "-vf", "scale=iw:ih:force_original_aspect_ratio=decrease",  # Maintain aspect ratio
                    "-q:v", "2",  # High quality
                    "-y",
                    output_path
                ]

                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

                if result.returncode == 0 and Path(output_path).exists():
                    frame_pairs.append(f"/api/clips/{output_filename}")
                    print(f"   ✅ Frame extracted: {output_filename}")
                else:
                    print(f"   ❌ Failed to extract frame {frame_num} from clip {clip_idx}")
                    print(f"   Error: {result.stderr[:200]}")
                    frame_pairs.append(None)

            if all(frame_pairs):
                frames.append({
                    "frame_num": frame_num + 1,
                    "clip1": frame_pairs[0],
                    "clip2": frame_pairs[1]
                })
            else:
                print(f"   ⚠️  Skipping frame {frame_num + 1} - not all clips extracted successfully")

        print(f"   🎉 Successfully extracted {len(frames)} frame pairs")
        return frames

    except Exception as e:
        print(f"   ❌ Frame extraction error: {e}")
        import traceback
        traceback.print_exc()
        return []


async def create_sidebyside_video(clip_paths: List[str], output_path: str) -> bool:
    """
    Use FFmpeg to create a side-by-side comparison video

    Args:
        clip_paths: List of paths to input clips (2-3 clips)
        output_path: Path to save the output comparison video

    Returns:
        True if successful, False otherwise
    """
    try:
        num_clips = len(clip_paths)

        if num_clips == 2:
            # Side-by-side (horizontal stack)
            filter_complex = "[0:v][1:v]hstack=inputs=2[v]"
            audio_mix = "[0:a][1:a]amerge=inputs=2[a]"
        elif num_clips == 3:
            # Three videos side-by-side
            filter_complex = "[0:v][1:v][2:v]hstack=inputs=3[v]"
            audio_mix = "[0:a][1:a][2:a]amerge=inputs=3[a]"
        else:
            return False

        # Build FFmpeg command
        cmd = ["ffmpeg"]

        # Add all input files
        for clip_path in clip_paths:
            cmd.extend(["-i", clip_path])

        # Add filter complex for video and audio
        cmd.extend([
            "-filter_complex", f"{filter_complex};{audio_mix}",
            "-map", "[v]",
            "-map", "[a]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-ac", "2",  # Stereo output
            "-y",
            output_path
        ])

        print(f"   🎬 Running FFmpeg comparison: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120  # Longer timeout for comparison
        )

        if result.returncode == 0:
            if Path(output_path).exists():
                file_size = Path(output_path).stat().st_size
                print(f"   ✅ Comparison video created! Size: {file_size} bytes")
                return True
            else:
                print(f"   ❌ FFmpeg returned 0 but file doesn't exist!")
                return False
        else:
            print(f"   ❌ FFmpeg failed with code {result.returncode}")
            print(f"   stderr: {result.stderr[:500]}")
            return False

    except subprocess.TimeoutExpired:
        print(f"   ⏱️  FFmpeg timeout for comparison video")
        return False
    except Exception as e:
        print(f"   ❌ FFmpeg error: {e}")
        import traceback
        traceback.print_exc()
        return False


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
