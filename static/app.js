/**
 * Swingcam Frontend Application
 * Handles video recording, audio detection, and clip review
 */

// DOM Elements
const preview = document.getElementById('preview');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const audioIndicator = document.getElementById('audio-indicator');
const swingCount = document.getElementById('swing-count');
const swingsList = document.getElementById('swings-list');
const swingTimestamps = document.getElementById('swing-timestamps');
const statusDiv = document.getElementById('status');
const recordingSection = document.getElementById('recording-section');
const processingSection = document.getElementById('processing-section');
const resultsSection = document.getElementById('results-section');
const clipsGrid = document.getElementById('clips-grid');
const newSessionBtn = document.getElementById('new-session-btn');

// Upload elements
const recordModeBtn = document.getElementById('record-mode-btn');
const uploadModeBtn = document.getElementById('upload-mode-btn');
const recordMode = document.getElementById('record-mode');
const uploadMode = document.getElementById('upload-mode');
const uploadArea = document.getElementById('upload-area');
const videoUpload = document.getElementById('video-upload');
const uploadPreviewContainer = document.getElementById('upload-preview-container');
const uploadPreview = document.getElementById('upload-preview');
const analyzeUploadBtn = document.getElementById('analyze-upload-btn');
const clearUploadBtn = document.getElementById('clear-upload-btn');

// Comparison elements
const selectedCountSpan = document.getElementById('selected-count');
const clipSelectionSection = document.getElementById('clip-selection-section');
const selectionClipsGrid = document.getElementById('selection-clips-grid');
const selectionInstructionText = document.getElementById('selection-instruction-text');
const requiredCountSpan = document.getElementById('required-count');
const createComparisonBtn = document.getElementById('create-comparison-btn');
const comparisonTypeLabel = document.getElementById('comparison-type-label');
const backToResultsBtn = document.getElementById('back-to-results-btn');
const comparisonSection = document.getElementById('comparison-section');
const comparisonGrid = document.getElementById('comparison-grid');
const comparisonTitle = document.getElementById('comparison-title');
const backToClipsBtn = document.getElementById('back-to-clips-btn');
const downloadResultBtn = document.getElementById('download-result-btn');
const sideBySideModeBtn = document.getElementById('sidebyside-mode-btn');
const overlayModeBtn = document.getElementById('overlay-mode-btn');
const positionModeBtn = document.getElementById('position-mode-btn');

// State
let mediaStream = null;
let mediaRecorder = null;
let audioContext = null;
let analyser = null;
let recordedChunks = [];
let detectedSwings = [];
let recordingStartTime = null;
let isRecording = false;

// Comparison state
let selectedClips = [];
let allClips = [];
let currentMode = null; // 'sidebyside', 'overlay', or 'position'
let currentComparisonUrl = null; // For downloads

// Audio detection configuration
const DETECTION_CONFIG = {
    threshold: 0.05,       // Volume threshold (0-1) - MAXIMUM SENSITIVITY
    cooldown: 600,         // Minimum ms between detections
    smoothing: 0.7,        // Audio analyzer smoothing (lower = more responsive)
    fftSize: 2048          // FFT size for frequency analysis
};

let lastDetectionTime = 0;

/**
 * Initialize the application
 */
async function init() {
    try {
        // Request camera and microphone access
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: {
                echoCancellation: false,  // We want to hear the swing!
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        // Display video preview
        preview.srcObject = mediaStream;

        // Set up audio analysis
        setupAudioAnalysis();

        // Enable start button
        startBtn.disabled = false;
        showStatus('Ready to record! Press "Start Recording" when ready.', 'info');

    } catch (error) {
        console.error('Error accessing media devices:', error);
        showStatus('Error: Could not access camera/microphone. Please grant permissions.', 'error');
    }
}

/**
 * Set up audio analysis for swing detection
 */
function setupAudioAnalysis() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();

    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    analyser.fftSize = DETECTION_CONFIG.fftSize;
    analyser.smoothingTimeConstant = DETECTION_CONFIG.smoothing;
}

/**
 * Start recording
 */
function startRecording() {
    // Reset state
    recordedChunks = [];
    detectedSwings = [];
    lastDetectionTime = 0;

    // Create media recorder
    const options = {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 2500000  // 2.5 Mbps
    };

    try {
        mediaRecorder = new MediaRecorder(mediaStream, options);
    } catch (error) {
        console.error('MediaRecorder error:', error);
        showStatus('Error: Could not start recording.', 'error');
        return;
    }

    mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = handleRecordingStop;

    // Start recording
    mediaRecorder.start(100);  // Collect data every 100ms
    recordingStartTime = Date.now();
    isRecording = true;

    // Update UI
    startBtn.disabled = true;
    stopBtn.disabled = false;
    audioIndicator.classList.add('active');
    swingsList.style.display = 'block';
    updateSwingCount();
    showStatus('Recording... Take your swings!', 'success');

    // Start audio monitoring
    monitorAudio();
}

/**
 * Monitor audio for swing detection
 */
function monitorAudio() {
    if (!isRecording) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / bufferLength);

    // Detect swing
    const now = Date.now();
    const timeSinceStart = (now - recordingStartTime) / 1000;  // seconds
    const timeSinceLastDetection = now - lastDetectionTime;

    if (rms > DETECTION_CONFIG.threshold && timeSinceLastDetection > DETECTION_CONFIG.cooldown) {
        // Swing detected!
        detectedSwings.push(timeSinceStart);
        lastDetectionTime = now;

        // Visual feedback
        audioIndicator.classList.add('detecting');
        setTimeout(() => {
            audioIndicator.classList.remove('detecting');
        }, 300);

        updateSwingCount();
        addSwingToList(detectedSwings.length, timeSinceStart);

        console.log(`Swing detected at ${timeSinceStart.toFixed(2)}s`);
    }

    // Continue monitoring
    requestAnimationFrame(monitorAudio);
}

/**
 * Stop recording
 */
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        isRecording = false;
        mediaRecorder.stop();

        // Update UI
        startBtn.disabled = false;
        stopBtn.disabled = true;
        audioIndicator.classList.remove('active');
        showStatus('Recording stopped. Processing...', 'info');
    }
}

/**
 * Handle recording stop event
 */
async function handleRecordingStop() {
    if (detectedSwings.length === 0) {
        showStatus('No swings detected. Try making louder contact or adjusting your setup.', 'error');
        return;
    }

    // Show processing UI
    recordingSection.style.display = 'none';
    processingSection.style.display = 'block';

    // Create video blob
    const blob = new Blob(recordedChunks, { type: 'video/webm' });

    // Upload and process
    await uploadAndProcess(blob, detectedSwings);
}

/**
 * Upload video and process clips
 */
async function uploadAndProcess(videoBlob, timestamps) {
    try {
        console.log('🎬 Starting upload...', {
            blobSize: videoBlob.size,
            timestamps: timestamps
        });

        // Create form data
        const formData = new FormData();
        formData.append('video', videoBlob, 'recording.webm');
        formData.append('timestamps', JSON.stringify(timestamps));

        console.log('📤 Uploading to /api/process...');

        // Upload to server
        const response = await fetch('/api/process', {
            method: 'POST',
            body: formData
        });

        console.log('📥 Server response:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Server error response:', errorText);
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ Processing result:', result);

        if (result.success && result.clips && result.clips.length > 0) {
            console.log(`🎥 Got ${result.clips.length} clips, displaying...`);
            displayClips(result.clips, timestamps);
        } else {
            throw new Error(`Processing failed - no clips returned. Result: ${JSON.stringify(result)}`);
        }

    } catch (error) {
        console.error('❌ Upload error:', error);
        processingSection.style.display = 'none';
        recordingSection.style.display = 'block';
        showStatus(`Error processing video: ${error.message}`, 'error');
    }
}

/**
 * Display processed clips (preview only, no selection)
 */
function displayClips(clipUrls, timestamps) {
    console.log('🎬 Displaying clips...', {
        clipCount: clipUrls.length,
        clipUrls: clipUrls
    });

    // Hide processing, show results
    processingSection.style.display = 'none';
    resultsSection.style.display = 'block';

    console.log('✅ Results section should now be visible');

    // Clear previous clips and selections
    clipsGrid.innerHTML = '';
    selectedClips = [];
    allClips = [];

    // Add each clip (preview only, no checkboxes)
    clipUrls.forEach((url, index) => {
        const timestamp = timestamps[index];
        const minutes = Math.floor(timestamp / 60);
        const seconds = (timestamp % 60).toFixed(1);

        // Store clip data
        const clipData = {
            url: url,
            index: index,
            timestamp: timestamp,
            label: `Swing ${index + 1}`
        };
        allClips.push(clipData);

        // Create clip element with thumbnail
        const clipItem = document.createElement('div');
        clipItem.className = 'clip-item';
        clipItem.dataset.clipIndex = index;

        // Generate thumbnail URL (replace .mp4 with _thumb.jpg)
        const thumbnailUrl = url.replace('.mp4', '_thumb.jpg');

        clipItem.innerHTML = `
            <div class="clip-thumbnail">
                <img src="${thumbnailUrl}" alt="Swing ${index + 1}" loading="lazy">
                <div class="play-overlay">▶</div>
            </div>
            <div class="clip-info">
                <h4>Swing ${index + 1}</h4>
                <p class="clip-time">${minutes}:${seconds.padStart(4, '0')}</p>
            </div>
        `;

        // Make thumbnail clickable to play video
        const thumbnail = clipItem.querySelector('.clip-thumbnail');
        thumbnail.addEventListener('click', () => {
            showVideoModal(url, `Swing ${index + 1}`);
        });

        clipsGrid.appendChild(clipItem);
        console.log(`✅ Added clip ${index + 1}: ${url}`);
    });

    console.log('🎉 All clips displayed!');
}

/**
 * Show video in a modal/overlay
 */
function showVideoModal(videoUrl, title) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'video-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <video controls autoplay loop playsinline>
                <source src="${videoUrl}" type="video/mp4">
            </video>
        </div>
    `;

    // Close on button click or background click
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
}

/**
 * Update swing count display
 */
function updateSwingCount() {
    const count = detectedSwings.length;
    swingCount.textContent = `${count} swing${count !== 1 ? 's' : ''} detected`;
}

/**
 * Add swing to the list
 */
function addSwingToList(number, timestamp) {
    const li = document.createElement('li');
    const minutes = Math.floor(timestamp / 60);
    const seconds = (timestamp % 60).toFixed(1);
    li.textContent = `Swing ${number} - ${minutes}:${seconds.padStart(4, '0')}`;
    swingTimestamps.appendChild(li);
}

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
}

/**
 * Start a new session
 */
function startNewSession() {
    // Reset UI
    resultsSection.style.display = 'none';
    comparisonSection.style.display = 'none';
    clipSelectionSection.style.display = 'none';
    headtrackSection.style.display = 'none';
    recordingSection.style.display = 'block';
    swingsList.style.display = 'none';
    swingTimestamps.innerHTML = '';
    statusDiv.className = 'status';

    // Reset to record mode
    switchToRecordMode();
    clearUpload();

    // Reset state
    detectedSwings = [];
    recordedChunks = [];
    selectedClips = [];
    allClips = [];
    currentMode = null;
    currentComparisonUrl = null;
    headPositions = [];
    updateSwingCount();

    showStatus('Ready to record! Press "Start Recording" when ready.', 'info');
}

/**
 * Show clip selection screen for a specific comparison mode
 */
function showClipSelection(mode) {
    currentMode = mode;
    selectedClips = [];

    // Hide results, show selection
    resultsSection.style.display = 'none';
    clipSelectionSection.style.display = 'block';

    // Configure UI based on mode
    let instructions = '';
    let requiredCount = 2;
    let modeLabel = '';

    switch (mode) {
        case 'sidebyside':
            instructions = 'Select 2-3 swing clips to view side-by-side';
            requiredCount = '2-3';
            modeLabel = 'Side-by-Side';
            break;
        case 'overlay':
            instructions = 'Select exactly 2 swing clips to overlay';
            requiredCount = '2';
            modeLabel = 'Overlay';
            break;
        case 'position':
            instructions = 'Select exactly 2 swing clips to compare positions';
            requiredCount = '2';
            modeLabel = 'Position Compare';
            break;
    }

    selectionInstructionText.textContent = instructions;
    requiredCountSpan.textContent = requiredCount;
    comparisonTypeLabel.textContent = modeLabel;

    // Populate clips grid with checkboxes and thumbnails
    selectionClipsGrid.innerHTML = '';
    allClips.forEach((clipData, index) => {
        const timestamp = clipData.timestamp;
        const minutes = Math.floor(timestamp / 60);
        const seconds = (timestamp % 60).toFixed(1);

        const clipItem = document.createElement('div');
        clipItem.className = 'clip-item selectable';
        clipItem.dataset.index = index;

        // Generate thumbnail URL
        const thumbnailUrl = clipData.url.replace('.mp4', '_thumb.jpg');

        clipItem.innerHTML = `
            <div class="clip-thumbnail">
                <img src="${thumbnailUrl}" alt="${clipData.label}" loading="lazy">
                <div class="selection-checkbox">
                    <input type="checkbox" class="clip-checkbox" data-index="${index}">
                </div>
            </div>
            <div class="clip-info">
                <h4>${clipData.label}</h4>
                <p class="clip-time">${minutes}:${seconds.padStart(4, '0')}</p>
            </div>
        `;

        // Add checkbox event listener
        const checkbox = clipItem.querySelector('.clip-checkbox');
        checkbox.addEventListener('change', (e) => {
            handleClipSelection(e);
            // Toggle visual selection state
            if (e.target.checked) {
                clipItem.classList.add('selected');
            } else {
                clipItem.classList.remove('selected');
            }
        });

        // Make entire item clickable to toggle checkbox
        const thumbnail = clipItem.querySelector('.clip-thumbnail');
        thumbnail.addEventListener('click', (e) => {
            // Don't trigger if clicking directly on checkbox
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });

        selectionClipsGrid.appendChild(clipItem);
    });

    updateSelectedCount();
}

/**
 * Handle clip selection checkbox change
 */
function handleClipSelection(event) {
    const index = parseInt(event.target.dataset.index);
    const isChecked = event.target.checked;

    if (isChecked) {
        // Check if we've reached max for this mode
        if (currentMode === 'sidebyside' && selectedClips.length >= 3) {
            event.target.checked = false;
            alert('Maximum 3 clips for Side-by-Side mode');
            return;
        } else if ((currentMode === 'overlay' || currentMode === 'position') && selectedClips.length >= 2) {
            event.target.checked = false;
            alert('Maximum 2 clips for this mode');
            return;
        }

        selectedClips.push(allClips[index]);
    } else {
        selectedClips = selectedClips.filter(clip => clip.index !== index);
    }

    updateSelectedCount();
}

/**
 * Update selected count display and button state
 */
function updateSelectedCount() {
    selectedCountSpan.textContent = selectedClips.length;

    // Enable button based on mode requirements
    let canCreate = false;
    if (currentMode === 'sidebyside') {
        canCreate = selectedClips.length >= 2 && selectedClips.length <= 3;
    } else if (currentMode === 'overlay' || currentMode === 'position') {
        canCreate = selectedClips.length === 2;
    }

    createComparisonBtn.disabled = !canCreate;
}

/**
 * Create comparison based on selected mode
 */
async function createComparison() {
    if (!currentMode || selectedClips.length < 2) {
        return;
    }

    clipSelectionSection.style.display = 'none';
    processingSection.style.display = 'block';

    try {
        const clipFilenames = selectedClips.map(clip => {
            const urlParts = clip.url.split('/');
            return urlParts[urlParts.length - 1];
        });

        const formData = new FormData();
        formData.append('clips', JSON.stringify(clipFilenames));

        let endpoint = '';
        let title = '';

        switch (currentMode) {
            case 'sidebyside':
                endpoint = '/api/compare';
                title = 'Side-by-Side Comparison';
                break;
            case 'overlay':
                endpoint = '/api/compare/overlay';
                title = 'Overlay Comparison (50% Transparency)';
                break;
            case 'position':
                endpoint = '/api/compare/position';
                title = 'Position Comparison';
                break;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log('📥 Server response:', result);

        if (currentMode === 'position') {
            // Position comparison returns frames
            if (result.success && result.frames) {
                console.log('🎞️ Received frames:', result.frames);
                showPositionComparison(result.frames, title);
            } else {
                throw new Error('Failed to create position comparison');
            }
        } else {
            // Video comparisons
            if (result.success && result.comparison_url) {
                showVideoComparison(result.comparison_url, title);
            } else {
                throw new Error('Failed to create comparison video');
            }
        }

    } catch (error) {
        console.error('❌ Comparison error:', error);
        processingSection.style.display = 'none';
        clipSelectionSection.style.display = 'block';
        alert(`Error creating comparison: ${error.message}`);
    }
}

/**
 * Show video comparison result
 */
function showVideoComparison(videoUrl, title) {
    processingSection.style.display = 'none';
    comparisonSection.style.display = 'block';

    // Store for downloads
    currentComparisonUrl = videoUrl;

    // Update title
    comparisonTitle.textContent = title;

    // Clear and add video
    comparisonGrid.innerHTML = '';
    const compareItem = document.createElement('div');
    compareItem.className = 'compare-item-full';

    compareItem.innerHTML = `
        <video class="compare-video" controls loop playsinline webkit-playsinline>
            <source src="${videoUrl}" type="video/mp4">
            Your browser does not support video playback.
        </video>
    `;

    comparisonGrid.appendChild(compareItem);

    // Show download button and comparison note
    downloadResultBtn.style.display = 'inline-flex';
    document.querySelector('.comparison-note').style.display = 'block';
}

/**
 * Show position comparison result
 */
function showPositionComparison(frames, title) {
    processingSection.style.display = 'none';
    comparisonSection.style.display = 'block';

    // No download for position comparison (it's multiple images)
    currentComparisonUrl = null;

    // Update title
    comparisonTitle.textContent = title;

    // Hide the comparison note and download button
    document.querySelector('.comparison-note').style.display = 'none';
    downloadResultBtn.style.display = 'none';

    // Clear and add frames
    comparisonGrid.innerHTML = '';
    const positionFrames = document.createElement('div');
    positionFrames.className = 'position-frames';

    frames.forEach(frame => {
        console.log('📸 Adding frame pair:', frame);

        const framePair = document.createElement('div');
        framePair.className = 'frame-pair';

        framePair.innerHTML = `
            <div class="frame-item">
                <h4>${selectedClips[0].label} - Frame ${frame.frame_num}</h4>
                <img src="${frame.clip1}" alt="Frame ${frame.frame_num}" loading="eager">
            </div>
            <div class="frame-item">
                <h4>${selectedClips[1].label} - Frame ${frame.frame_num}</h4>
                <img src="${frame.clip2}" alt="Frame ${frame.frame_num}" loading="eager">
            </div>
        `;

        positionFrames.appendChild(framePair);
    });

    comparisonGrid.appendChild(positionFrames);
}

/**
 * Download the current comparison result
 */
function downloadResult() {
    if (!currentComparisonUrl) return;

    const link = document.createElement('a');
    link.href = currentComparisonUrl;
    link.download = `swingcam-${currentMode}-comparison.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Go back to clips view from comparison
 */
function backToClips() {
    comparisonSection.style.display = 'none';
    resultsSection.style.display = 'block';

    // Reset for next comparison
    currentMode = null;
    currentComparisonUrl = null;
}

/**
 * Go back to results from clip selection
 */
function backToResults() {
    clipSelectionSection.style.display = 'none';
    resultsSection.style.display = 'block';

    // Reset selections
    selectedClips = [];
    currentMode = null;
}

// Head Tracking Elements
const headtrackModeBtn = document.getElementById('headtrack-mode-btn');
const headtrackSection = document.getElementById('headtrack-section');
const headtrackClipsGrid = document.getElementById('headtrack-clips-grid');
const headtrackClipSelection = document.getElementById('headtrack-clip-selection');
const headtrackProcessing = document.getElementById('headtrack-processing');
const headtrackResults = document.getElementById('headtrack-results');
const headtrackVideo = document.getElementById('headtrack-video');
const headtrackCanvas = document.getElementById('headtrack-canvas');
const headtrackProgress = document.getElementById('headtrack-progress');
const headtrackProgressText = document.getElementById('headtrack-progress-text');
const headtrackPlayBtn = document.getElementById('headtrack-play-btn');
const headtrackResetBtn = document.getElementById('headtrack-reset-btn');
const headtrackShowTrace = document.getElementById('headtrack-show-trace');
const headtrackShowBox = document.getElementById('headtrack-show-box');
const headtrackBackBtn = document.getElementById('headtrack-back-btn');
const statTotalMovement = document.getElementById('stat-total-movement');
const statMaxDeviation = document.getElementById('stat-max-deviation');
const statStability = document.getElementById('stat-stability');

// Head Tracking State
let faceDetector = null;
let headPositions = [];
let isHeadtrackPlaying = false;
let headtrackAnimationFrame = null;

// Upload State
let uploadedVideoFile = null;
let uploadedVideoUrl = null;

/**
 * Initialize TensorFlow.js Face Detection Model
 */
async function initFaceDetector() {
    if (faceDetector) return faceDetector;

    console.log('🎯 Loading face detection model...');
    try {
        const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
        faceDetector = await faceDetection.createDetector(model, {
            runtime: 'tfjs',
            modelType: 'short'
        });
        console.log('✅ Face detection model loaded!');
        return faceDetector;
    } catch (error) {
        console.error('❌ Failed to load face detection model:', error);
        throw error;
    }
}

/**
 * Show head tracking mode
 */
function showHeadTrackingMode() {
    resultsSection.style.display = 'none';
    headtrackSection.style.display = 'block';

    // Reset state
    headtrackClipSelection.style.display = 'block';
    headtrackProcessing.style.display = 'none';
    headtrackResults.style.display = 'none';
    headPositions = [];

    // Populate clips grid
    headtrackClipsGrid.innerHTML = '';
    allClips.forEach((clipData, index) => {
        const timestamp = clipData.timestamp;
        const minutes = Math.floor(timestamp / 60);
        const seconds = (timestamp % 60).toFixed(1);

        const thumbnailUrl = clipData.url.replace('.mp4', '_thumb.jpg');

        const clipItem = document.createElement('div');
        clipItem.className = 'clip-item';
        clipItem.dataset.clipIndex = index;

        clipItem.innerHTML = `
            <div class="clip-thumbnail">
                <img src="${thumbnailUrl}" alt="${clipData.label}" loading="lazy">
                <div class="play-overlay">🎯</div>
            </div>
            <div class="clip-info">
                <h4>${clipData.label}</h4>
                <p class="clip-time">${minutes}:${seconds.padStart(4, '0')}</p>
            </div>
        `;

        clipItem.addEventListener('click', () => {
            analyzeHeadTracking(clipData);
        });

        headtrackClipsGrid.appendChild(clipItem);
    });
}

/**
 * Analyze head tracking for a selected clip
 */
async function analyzeHeadTracking(clipData) {
    console.log('🎯 Starting head tracking analysis for:', clipData.label);

    // Show processing state
    headtrackClipSelection.style.display = 'none';
    headtrackProcessing.style.display = 'block';
    headtrackResults.style.display = 'none';
    headtrackProgress.style.width = '0%';
    headtrackProgressText.textContent = '0% - Loading model...';

    try {
        // Initialize face detector
        await initFaceDetector();
        headtrackProgressText.textContent = '10% - Loading video...';
        headtrackProgress.style.width = '10%';

        // Load the video
        const videoUrl = clipData.url;
        headtrackVideo.src = videoUrl;

        await new Promise((resolve, reject) => {
            headtrackVideo.onloadedmetadata = resolve;
            headtrackVideo.onerror = reject;
        });

        await new Promise((resolve) => {
            headtrackVideo.oncanplaythrough = resolve;
            headtrackVideo.load();
        });

        headtrackProgressText.textContent = '20% - Analyzing frames...';
        headtrackProgress.style.width = '20%';

        // Process video frames to detect head positions
        await processVideoForHeadTracking();

        // Show results
        headtrackProcessing.style.display = 'none';
        headtrackResults.style.display = 'block';

        // Setup canvas
        setupHeadtrackCanvas();

        // Calculate and display statistics
        calculateHeadtrackStats();

        // Start playback
        headtrackVideo.currentTime = 0;

    } catch (error) {
        console.error('❌ Head tracking analysis failed:', error);
        alert('Head tracking analysis failed. Make sure your face is visible in the video.');
        headtrackProcessing.style.display = 'none';
        headtrackClipSelection.style.display = 'block';
    }
}

/**
 * Process video frames to extract head positions
 */
async function processVideoForHeadTracking() {
    const video = headtrackVideo;
    const duration = video.duration;
    const fps = 15; // Sample at 15 fps for performance
    const totalFrames = Math.floor(duration * fps);

    headPositions = [];

    // Create off-screen canvas for frame extraction
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = video.videoWidth;
    offscreenCanvas.height = video.videoHeight;
    const ctx = offscreenCanvas.getContext('2d');

    for (let i = 0; i <= totalFrames; i++) {
        const time = (i / fps);
        video.currentTime = time;

        // Wait for the video to seek to the new time
        await new Promise(resolve => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
            };
            video.addEventListener('seeked', onSeeked);
        });

        // Draw frame to canvas
        ctx.drawImage(video, 0, 0);

        // Detect faces
        try {
            const faces = await faceDetector.estimateFaces(offscreenCanvas);

            if (faces.length > 0) {
                const face = faces[0];
                const box = face.box;

                // Calculate center of face/head
                const centerX = box.xMin + box.width / 2;
                const centerY = box.yMin + box.height / 2;

                headPositions.push({
                    time: time,
                    x: centerX,
                    y: centerY,
                    width: box.width,
                    height: box.height,
                    detected: true
                });
            } else {
                // No face detected - interpolate or mark as missing
                headPositions.push({
                    time: time,
                    x: null,
                    y: null,
                    width: null,
                    height: null,
                    detected: false
                });
            }
        } catch (error) {
            console.warn(`Frame ${i} detection error:`, error);
            headPositions.push({
                time: time,
                x: null,
                y: null,
                width: null,
                height: null,
                detected: false
            });
        }

        // Update progress
        const progress = 20 + (i / totalFrames) * 75;
        headtrackProgress.style.width = `${progress}%`;
        headtrackProgressText.textContent = `${Math.round(progress)}% - Analyzing frame ${i + 1}/${totalFrames + 1}`;
    }

    // Interpolate missing positions
    interpolateMissingPositions();

    headtrackProgress.style.width = '100%';
    headtrackProgressText.textContent = '100% - Complete!';

    console.log(`✅ Processed ${headPositions.length} frames, detected ${headPositions.filter(p => p.detected).length} faces`);
}

/**
 * Interpolate missing head positions
 */
function interpolateMissingPositions() {
    for (let i = 0; i < headPositions.length; i++) {
        if (!headPositions[i].detected) {
            // Find previous and next detected positions
            let prevIdx = i - 1;
            let nextIdx = i + 1;

            while (prevIdx >= 0 && !headPositions[prevIdx].detected) prevIdx--;
            while (nextIdx < headPositions.length && !headPositions[nextIdx].detected) nextIdx++;

            if (prevIdx >= 0 && nextIdx < headPositions.length) {
                // Interpolate between prev and next
                const prev = headPositions[prevIdx];
                const next = headPositions[nextIdx];
                const ratio = (i - prevIdx) / (nextIdx - prevIdx);

                headPositions[i].x = prev.x + (next.x - prev.x) * ratio;
                headPositions[i].y = prev.y + (next.y - prev.y) * ratio;
                headPositions[i].width = prev.width + (next.width - prev.width) * ratio;
                headPositions[i].height = prev.height + (next.height - prev.height) * ratio;
            } else if (prevIdx >= 0) {
                // Use previous position
                headPositions[i].x = headPositions[prevIdx].x;
                headPositions[i].y = headPositions[prevIdx].y;
                headPositions[i].width = headPositions[prevIdx].width;
                headPositions[i].height = headPositions[prevIdx].height;
            } else if (nextIdx < headPositions.length) {
                // Use next position
                headPositions[i].x = headPositions[nextIdx].x;
                headPositions[i].y = headPositions[nextIdx].y;
                headPositions[i].width = headPositions[nextIdx].width;
                headPositions[i].height = headPositions[nextIdx].height;
            }
        }
    }
}

/**
 * Setup the head tracking canvas overlay
 */
function setupHeadtrackCanvas() {
    const video = headtrackVideo;
    const canvas = headtrackCanvas;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Set up video time update listener
    video.removeEventListener('timeupdate', drawHeadtrackOverlay);
    video.addEventListener('timeupdate', drawHeadtrackOverlay);

    // Initial draw
    drawHeadtrackOverlay();
}

/**
 * Draw head tracking overlay on canvas
 */
function drawHeadtrackOverlay() {
    const video = headtrackVideo;
    const canvas = headtrackCanvas;
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (headPositions.length === 0) return;

    const currentTime = video.currentTime;
    const showTrace = headtrackShowTrace.checked;
    const showBox = headtrackShowBox.checked;

    // Find positions up to current time
    const currentPositions = headPositions.filter(p => p.time <= currentTime && p.x !== null);

    if (currentPositions.length === 0) return;

    // Draw trace (path of head movement)
    if (showTrace && currentPositions.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(124, 58, 237, 0.8)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Create gradient along the path
        ctx.moveTo(currentPositions[0].x, currentPositions[0].y);

        for (let i = 1; i < currentPositions.length; i++) {
            ctx.lineTo(currentPositions[i].x, currentPositions[i].y);
        }

        ctx.stroke();

        // Draw dots at key positions
        for (let i = 0; i < currentPositions.length; i += Math.max(1, Math.floor(currentPositions.length / 10))) {
            const pos = currentPositions[i];
            ctx.beginPath();
            ctx.fillStyle = `rgba(124, 58, 237, ${0.5 + (i / currentPositions.length) * 0.5})`;
            ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Draw current head position box
    if (showBox && currentPositions.length > 0) {
        const current = currentPositions[currentPositions.length - 1];

        // Draw bounding box
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
            current.x - current.width / 2,
            current.y - current.height / 2,
            current.width,
            current.height
        );
        ctx.setLineDash([]);

        // Draw center crosshair
        ctx.beginPath();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        const crossSize = 10;
        ctx.moveTo(current.x - crossSize, current.y);
        ctx.lineTo(current.x + crossSize, current.y);
        ctx.moveTo(current.x, current.y - crossSize);
        ctx.lineTo(current.x, current.y + crossSize);
        ctx.stroke();
    }

    // Draw starting position reference
    if (showTrace && headPositions.length > 0 && headPositions[0].x !== null) {
        const start = headPositions[0];
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.arc(start.x, start.y, 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(37, 99, 235, 0.8)';
        ctx.fillText('START', start.x + 20, start.y + 5);
    }
}

/**
 * Calculate and display head tracking statistics
 */
function calculateHeadtrackStats() {
    const validPositions = headPositions.filter(p => p.x !== null);

    if (validPositions.length < 2) {
        statTotalMovement.textContent = '--';
        statMaxDeviation.textContent = '--';
        statStability.textContent = '--';
        return;
    }

    // Calculate total movement (sum of distances between consecutive positions)
    let totalMovement = 0;
    for (let i = 1; i < validPositions.length; i++) {
        const dx = validPositions[i].x - validPositions[i - 1].x;
        const dy = validPositions[i].y - validPositions[i - 1].y;
        totalMovement += Math.sqrt(dx * dx + dy * dy);
    }

    // Calculate max deviation from starting position
    const startX = validPositions[0].x;
    const startY = validPositions[0].y;
    let maxDeviation = 0;

    for (const pos of validPositions) {
        const deviation = Math.sqrt((pos.x - startX) ** 2 + (pos.y - startY) ** 2);
        if (deviation > maxDeviation) maxDeviation = deviation;
    }

    // Calculate stability score (inverse of standard deviation of positions)
    const avgX = validPositions.reduce((sum, p) => sum + p.x, 0) / validPositions.length;
    const avgY = validPositions.reduce((sum, p) => sum + p.y, 0) / validPositions.length;

    let variance = 0;
    for (const pos of validPositions) {
        variance += (pos.x - avgX) ** 2 + (pos.y - avgY) ** 2;
    }
    const stdDev = Math.sqrt(variance / validPositions.length);

    // Convert to a 0-100 stability score (higher is better)
    // Using video width as reference for normalization
    const videoWidth = headtrackVideo.videoWidth;
    const normalizedStdDev = stdDev / videoWidth;
    const stabilityScore = Math.max(0, Math.min(100, Math.round(100 * (1 - normalizedStdDev * 10))));

    // Display stats (convert pixel values to relative percentages of video width for display)
    statTotalMovement.textContent = `${Math.round(totalMovement / videoWidth * 100)}%`;
    statMaxDeviation.textContent = `${Math.round(maxDeviation / videoWidth * 100)}%`;
    statStability.textContent = `${stabilityScore}/100`;

    // Color code stability
    if (stabilityScore >= 80) {
        statStability.style.color = '#10b981'; // Green - excellent
    } else if (stabilityScore >= 60) {
        statStability.style.color = '#f59e0b'; // Orange - good
    } else {
        statStability.style.color = '#ef4444'; // Red - needs work
    }
}

/**
 * Toggle head tracking video playback
 */
function toggleHeadtrackPlayback() {
    if (isHeadtrackPlaying) {
        headtrackVideo.pause();
        headtrackPlayBtn.innerHTML = '<span class="icon">▶️</span> Play';
        isHeadtrackPlaying = false;
    } else {
        headtrackVideo.play();
        headtrackPlayBtn.innerHTML = '<span class="icon">⏸️</span> Pause';
        isHeadtrackPlaying = true;
    }
}

/**
 * Reset head tracking video to beginning
 */
function resetHeadtrackVideo() {
    headtrackVideo.currentTime = 0;
    headtrackVideo.pause();
    headtrackPlayBtn.innerHTML = '<span class="icon">▶️</span> Play';
    isHeadtrackPlaying = false;
    drawHeadtrackOverlay();
}

/**
 * Go back from head tracking to results
 */
function backFromHeadtrack() {
    headtrackSection.style.display = 'none';
    resultsSection.style.display = 'block';

    // Stop video and cleanup
    headtrackVideo.pause();
    headtrackVideo.src = '';
    isHeadtrackPlaying = false;
    headPositions = [];
}

/**
 * Switch to record mode
 */
function switchToRecordMode() {
    recordModeBtn.classList.add('active');
    uploadModeBtn.classList.remove('active');
    recordMode.style.display = 'block';
    uploadMode.style.display = 'none';
}

/**
 * Switch to upload mode
 */
function switchToUploadMode() {
    uploadModeBtn.classList.add('active');
    recordModeBtn.classList.remove('active');
    uploadMode.style.display = 'block';
    recordMode.style.display = 'none';
}

/**
 * Handle file selection for upload
 */
function handleFileSelect(file) {
    if (!file || !file.type.startsWith('video/')) {
        showStatus('Please select a valid video file.', 'error');
        return;
    }

    uploadedVideoFile = file;

    // Revoke previous URL if exists
    if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
    }

    uploadedVideoUrl = URL.createObjectURL(file);
    uploadPreview.src = uploadedVideoUrl;

    uploadArea.style.display = 'none';
    uploadPreviewContainer.style.display = 'block';

    showStatus(`Video loaded: ${file.name}`, 'success');
}

/**
 * Clear the uploaded video
 */
function clearUpload() {
    if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
    }

    uploadedVideoFile = null;
    uploadedVideoUrl = null;
    uploadPreview.src = '';

    uploadPreviewContainer.style.display = 'none';
    uploadArea.style.display = 'block';

    showStatus('', 'info');
}

/**
 * Analyze the uploaded video for head tracking
 */
async function analyzeUploadedVideo() {
    if (!uploadedVideoUrl) {
        showStatus('Please upload a video first.', 'error');
        return;
    }

    console.log('🎯 Starting head tracking analysis for uploaded video');

    // Create a fake clip data object for the uploaded video
    const clipData = {
        url: uploadedVideoUrl,
        label: uploadedVideoFile.name || 'Uploaded Video',
        timestamp: 0,
        isUploaded: true
    };

    // Show head tracking section directly (skip results section)
    recordingSection.style.display = 'none';
    headtrackSection.style.display = 'block';

    // Hide clip selection, go directly to processing
    headtrackClipSelection.style.display = 'none';
    headtrackProcessing.style.display = 'block';
    headtrackResults.style.display = 'none';
    headtrackProgress.style.width = '0%';
    headtrackProgressText.textContent = '0% - Loading model...';

    try {
        // Initialize face detector
        await initFaceDetector();
        headtrackProgressText.textContent = '10% - Loading video...';
        headtrackProgress.style.width = '10%';

        // Load the video
        headtrackVideo.src = uploadedVideoUrl;

        await new Promise((resolve, reject) => {
            headtrackVideo.onloadedmetadata = resolve;
            headtrackVideo.onerror = reject;
        });

        await new Promise((resolve) => {
            headtrackVideo.oncanplaythrough = resolve;
            headtrackVideo.load();
        });

        headtrackProgressText.textContent = '20% - Analyzing frames...';
        headtrackProgress.style.width = '20%';

        // Process video frames to detect head positions
        await processVideoForHeadTracking();

        // Show results
        headtrackProcessing.style.display = 'none';
        headtrackResults.style.display = 'block';

        // Setup canvas
        setupHeadtrackCanvas();

        // Calculate and display statistics
        calculateHeadtrackStats();

        // Start playback
        headtrackVideo.currentTime = 0;

    } catch (error) {
        console.error('❌ Head tracking analysis failed:', error);
        alert('Head tracking analysis failed. Make sure a face is visible in the video.');
        headtrackSection.style.display = 'none';
        recordingSection.style.display = 'block';
    }
}

/**
 * Modified back function for uploaded videos
 */
function backFromHeadtrackToUpload() {
    headtrackSection.style.display = 'none';

    // If we came from upload, go back to recording section
    if (uploadedVideoUrl) {
        recordingSection.style.display = 'block';
    } else {
        resultsSection.style.display = 'block';
    }

    // Stop video and cleanup
    headtrackVideo.pause();
    headtrackVideo.src = '';
    isHeadtrackPlaying = false;
    headPositions = [];
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
newSessionBtn.addEventListener('click', startNewSession);

// Mode selection event listeners
sideBySideModeBtn.addEventListener('click', () => showClipSelection('sidebyside'));
overlayModeBtn.addEventListener('click', () => showClipSelection('overlay'));
positionModeBtn.addEventListener('click', () => showClipSelection('position'));
headtrackModeBtn.addEventListener('click', showHeadTrackingMode);

// Clip selection and comparison event listeners
createComparisonBtn.addEventListener('click', createComparison);
backToResultsBtn.addEventListener('click', backToResults);
backToClipsBtn.addEventListener('click', backToClips);
downloadResultBtn.addEventListener('click', downloadResult);

// Head tracking event listeners
headtrackPlayBtn.addEventListener('click', toggleHeadtrackPlayback);
headtrackResetBtn.addEventListener('click', resetHeadtrackVideo);
headtrackBackBtn.addEventListener('click', backFromHeadtrackToUpload);
headtrackShowTrace.addEventListener('change', drawHeadtrackOverlay);
headtrackShowBox.addEventListener('change', drawHeadtrackOverlay);

// Upload event listeners
recordModeBtn.addEventListener('click', switchToRecordMode);
uploadModeBtn.addEventListener('click', switchToUploadMode);
analyzeUploadBtn.addEventListener('click', analyzeUploadedVideo);
clearUploadBtn.addEventListener('click', clearUpload);

// File upload handling
uploadArea.addEventListener('click', () => videoUpload.click());
videoUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

// Drag and drop handling
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

// Initialize on page load
window.addEventListener('load', init);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
        audioContext.close();
    }
});
