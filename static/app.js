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
const startSection = document.getElementById('start-section');
const recordingSection = document.getElementById('recording-section');
const uploadSection = document.getElementById('upload-section');
const processingSection = document.getElementById('processing-section');
const resultsSection = document.getElementById('results-section');
const clipsGrid = document.getElementById('clips-grid');
const newSessionBtn = document.getElementById('new-session-btn');

// Start section elements
const startRecordBtn = document.getElementById('start-record-btn');
const startUploadBtn = document.getElementById('start-upload-btn');
const backToStartBtn = document.getElementById('back-to-start-btn');
const uploadBackToStartBtn = document.getElementById('upload-back-to-start-btn');

// Upload elements
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

// Club selection elements
const headtrackSelectClub = document.getElementById('headtrack-select-club');
const selectionVideo = document.getElementById('selection-video');
const selectionCanvas = document.getElementById('selection-canvas');
const selectionContainer = document.getElementById('selection-container');
const selectionMarker = document.getElementById('selection-marker');
const confirmSelectionBtn = document.getElementById('confirm-selection-btn');
const cancelSelectionBtn = document.getElementById('cancel-selection-btn');

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

// Head Tracking State
let faceDetector = null;
let headPositions = [];
let isHeadtrackPlaying = false;
let headtrackAnimationFrame = null;

// Upload State
let uploadedVideoFile = null;
let uploadedVideoUrl = null;

// Club selection state
let selectedClubPoint = null;  // {x, y} in video coordinates
let clubTemplate = null;       // ImageData of the template to track
const TEMPLATE_SIZE = 32;      // Size of template to extract and match

// Audio detection configuration
const DETECTION_CONFIG = {
    threshold: 0.05,       // Volume threshold (0-1) - MAXIMUM SENSITIVITY
    cooldown: 600,         // Minimum ms between detections
    smoothing: 0.7,        // Audio analyzer smoothing (lower = more responsive)
    fftSize: 2048          // FFT size for frequency analysis
};

let lastDetectionTime = 0;

/**
 * Initialize the application - just set up event listeners
 */
function init() {
    // App starts showing the start section (choice between record/upload)
    console.log('🎬 Swingcam initialized - waiting for user choice');
}

/**
 * Initialize camera and microphone for recording mode
 */
async function initCamera() {
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

        return true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        showStatus('Error: Could not access camera/microphone. Please grant permissions.', 'error');
        return false;
    }
}

/**
 * Show the start section (mode selection)
 */
function showStartSection() {
    // Stop any active media streams
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    // Hide all sections
    startSection.style.display = 'block';
    recordingSection.style.display = 'none';
    uploadSection.style.display = 'none';
    processingSection.style.display = 'none';
    resultsSection.style.display = 'none';
    comparisonSection.style.display = 'none';
    clipSelectionSection.style.display = 'none';
    headtrackSection.style.display = 'none';

    // Reset state
    clearUpload();
}

/**
 * Show recording mode
 */
async function showRecordingMode() {
    startSection.style.display = 'none';
    recordingSection.style.display = 'block';

    // Initialize camera
    await initCamera();
}

/**
 * Show upload mode
 */
function showUploadMode() {
    startSection.style.display = 'none';
    uploadSection.style.display = 'block';
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
 * Start a new session - go back to start selection
 */
function startNewSession() {
    // Reset state
    detectedSwings = [];
    recordedChunks = [];
    selectedClips = [];
    allClips = [];
    currentMode = null;
    currentComparisonUrl = null;
    headPositions = [];
    swingTimestamps.innerHTML = '';
    swingsList.style.display = 'none';
    statusDiv.className = 'status';
    updateSwingCount();

    // Go back to start section
    showStartSection();
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

/**
 * No model needed for club tracking - uses motion detection
 */
async function initFaceDetector() {
    console.log('🏌️ Club tracking ready - using motion detection');
    return true;
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
 * Analyze club head tracking for a selected clip
 */
async function analyzeHeadTracking(clipData) {
    console.log('🏌️ Starting club path analysis for:', clipData.label);

    // Show processing state
    headtrackClipSelection.style.display = 'none';
    headtrackProcessing.style.display = 'block';
    headtrackResults.style.display = 'none';
    headtrackProgress.style.width = '0%';
    headtrackProgressText.textContent = '0% - Loading video...';

    try {
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

        // Process video frames to detect club positions via motion
        await processVideoForClubTracking();

        // Show results
        headtrackProcessing.style.display = 'none';
        headtrackResults.style.display = 'block';

        // Setup canvas
        setupHeadtrackCanvas();

        // Calculate and display statistics
        calculateClubStats();

        // Start playback
        headtrackVideo.currentTime = 0;

    } catch (error) {
        console.error('❌ Club tracking analysis failed:', error);
        alert('Club tracking analysis failed. Please try with a different video.');
        headtrackProcessing.style.display = 'none';
        headtrackClipSelection.style.display = 'block';
    }
}

/**
 * Process video frames to track club head via motion detection
 */
async function processVideoForClubTracking() {
    const video = headtrackVideo;
    const duration = video.duration;
    const fps = 30; // Higher fps for smoother club tracking
    const totalFrames = Math.floor(duration * fps);

    headPositions = [];

    // Create off-screen canvases for frame comparison
    const canvas1 = document.createElement('canvas');
    const canvas2 = document.createElement('canvas');
    canvas1.width = video.videoWidth;
    canvas1.height = video.videoHeight;
    canvas2.width = video.videoWidth;
    canvas2.height = video.videoHeight;
    const ctx1 = canvas1.getContext('2d', { willReadFrequently: true });
    const ctx2 = canvas2.getContext('2d', { willReadFrequently: true });

    let prevImageData = null;

    for (let i = 0; i <= totalFrames; i++) {
        const time = (i / fps);
        video.currentTime = time;

        // Wait for the video to seek
        await new Promise(resolve => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
            };
            video.addEventListener('seeked', onSeeked);
        });

        // Draw current frame
        ctx1.drawImage(video, 0, 0);
        const currentImageData = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);

        if (prevImageData) {
            // Find the point of maximum motion (club head)
            const motionPoint = findMaxMotionPoint(prevImageData, currentImageData, canvas1.width, canvas1.height);

            if (motionPoint) {
                headPositions.push({
                    time: time,
                    x: motionPoint.x,
                    y: motionPoint.y,
                    speed: motionPoint.speed,
                    detected: true
                });
            } else {
                headPositions.push({
                    time: time,
                    x: null,
                    y: null,
                    speed: 0,
                    detected: false
                });
            }
        } else {
            // First frame - no motion yet
            headPositions.push({
                time: time,
                x: null,
                y: null,
                speed: 0,
                detected: false
            });
        }

        // Store current frame for next comparison
        prevImageData = currentImageData;

        // Update progress
        const progress = 20 + (i / totalFrames) * 75;
        headtrackProgress.style.width = `${progress}%`;
        headtrackProgressText.textContent = `${Math.round(progress)}% - Tracking frame ${i + 1}/${totalFrames + 1}`;
    }

    // Smooth the positions
    smoothClubPositions();

    headtrackProgress.style.width = '100%';
    headtrackProgressText.textContent = '100% - Complete!';

    console.log(`✅ Processed ${headPositions.length} frames, tracked ${headPositions.filter(p => p.detected).length} positions`);
}

/**
 * Find the point of maximum motion between two frames
 */
function findMaxMotionPoint(prevData, currData, width, height) {
    const blockSize = 16; // Analyze in blocks for efficiency
    const threshold = 30; // Minimum difference to count as motion

    let maxMotion = 0;
    let maxX = 0;
    let maxY = 0;

    // Scan the frame in blocks
    for (let y = 0; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
            let blockMotion = 0;
            let motionPixels = 0;
            let sumX = 0;
            let sumY = 0;

            // Analyze each pixel in the block
            for (let by = 0; by < blockSize && y + by < height; by++) {
                for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
                    const px = x + bx;
                    const py = y + by;
                    const idx = (py * width + px) * 4;

                    // Calculate grayscale difference
                    const prevGray = (prevData.data[idx] + prevData.data[idx + 1] + prevData.data[idx + 2]) / 3;
                    const currGray = (currData.data[idx] + currData.data[idx + 1] + currData.data[idx + 2]) / 3;
                    const diff = Math.abs(currGray - prevGray);

                    if (diff > threshold) {
                        blockMotion += diff;
                        motionPixels++;
                        sumX += px;
                        sumY += py;
                    }
                }
            }

            if (blockMotion > maxMotion) {
                maxMotion = blockMotion;
                // Use centroid of motion within the block
                if (motionPixels > 0) {
                    maxX = sumX / motionPixels;
                    maxY = sumY / motionPixels;
                }
            }
        }
    }

    // Return null if no significant motion detected
    if (maxMotion < threshold * blockSize) {
        return null;
    }

    return { x: maxX, y: maxY, speed: maxMotion };
}

/**
 * Smooth club positions to reduce noise
 */
function smoothClubPositions() {
    const windowSize = 3;
    const smoothed = [];

    for (let i = 0; i < headPositions.length; i++) {
        if (!headPositions[i].detected) {
            smoothed.push(headPositions[i]);
            continue;
        }

        let sumX = 0, sumY = 0, count = 0;

        for (let j = Math.max(0, i - windowSize); j <= Math.min(headPositions.length - 1, i + windowSize); j++) {
            if (headPositions[j].detected && headPositions[j].x !== null) {
                sumX += headPositions[j].x;
                sumY += headPositions[j].y;
                count++;
            }
        }

        if (count > 0) {
            smoothed.push({
                ...headPositions[i],
                x: sumX / count,
                y: sumY / count
            });
        } else {
            smoothed.push(headPositions[i]);
        }
    }

    headPositions = smoothed;
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
 * Draw club path overlay on canvas
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

    // Draw club path trace with gradient color based on speed
    if (showTrace && currentPositions.length > 1) {
        // Draw path segments with speed-based coloring
        for (let i = 1; i < currentPositions.length; i++) {
            const prev = currentPositions[i - 1];
            const curr = currentPositions[i];

            // Color based on speed (green = slow, yellow = medium, red = fast)
            const speed = curr.speed || 0;
            const maxSpeed = Math.max(...currentPositions.map(p => p.speed || 0));
            const speedRatio = maxSpeed > 0 ? speed / maxSpeed : 0;

            // Gradient from cyan to magenta based on speed
            const r = Math.round(255 * speedRatio);
            const g = Math.round(255 * (1 - speedRatio * 0.5));
            const b = 255;

            ctx.beginPath();
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.stroke();
        }

        // Draw dots at regular intervals
        for (let i = 0; i < currentPositions.length; i += Math.max(1, Math.floor(currentPositions.length / 15))) {
            const pos = currentPositions[i];
            ctx.beginPath();
            ctx.fillStyle = '#ffffff';
            ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    // Draw current club head position
    if (showBox && currentPositions.length > 0) {
        const current = currentPositions[currentPositions.length - 1];

        // Draw glowing circle at current position
        ctx.beginPath();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.arc(current.x, current.y, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = '#10b981';
        ctx.arc(current.x, current.y, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.arc(current.x, current.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Calculate and display club swing statistics
 */
function calculateClubStats() {
    const validPositions = headPositions.filter(p => p.x !== null);

    if (validPositions.length < 2) {
        statTotalMovement.textContent = '--';
        statMaxDeviation.textContent = '--';
        statStability.textContent = '--';
        return;
    }

    // Calculate total arc length (sum of distances between consecutive positions)
    let totalArc = 0;
    for (let i = 1; i < validPositions.length; i++) {
        const dx = validPositions[i].x - validPositions[i - 1].x;
        const dy = validPositions[i].y - validPositions[i - 1].y;
        totalArc += Math.sqrt(dx * dx + dy * dy);
    }

    // Find max speed
    const maxSpeed = Math.max(...validPositions.map(p => p.speed || 0));

    // Calculate path smoothness (lower variation = smoother)
    // Using angle changes between segments
    let angleChanges = 0;
    for (let i = 2; i < validPositions.length; i++) {
        const dx1 = validPositions[i - 1].x - validPositions[i - 2].x;
        const dy1 = validPositions[i - 1].y - validPositions[i - 2].y;
        const dx2 = validPositions[i].x - validPositions[i - 1].x;
        const dy2 = validPositions[i].y - validPositions[i - 1].y;

        const angle1 = Math.atan2(dy1, dx1);
        const angle2 = Math.atan2(dy2, dx2);
        let angleDiff = Math.abs(angle2 - angle1);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

        angleChanges += angleDiff;
    }

    // Convert to smoothness score (0-100, higher = smoother)
    const avgAngleChange = angleChanges / Math.max(1, validPositions.length - 2);
    const smoothnessScore = Math.max(0, Math.min(100, Math.round(100 * (1 - avgAngleChange / Math.PI))));

    // Display stats
    const videoWidth = headtrackVideo.videoWidth;
    statTotalMovement.textContent = `${Math.round(totalArc)}px`;
    statMaxDeviation.textContent = `${Math.round(maxSpeed / 100)}`;
    statStability.textContent = `${smoothnessScore}/100`;

    // Color code smoothness
    if (smoothnessScore >= 80) {
        statStability.style.color = '#10b981'; // Green - excellent
    } else if (smoothnessScore >= 60) {
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
 * Analyze the uploaded video - show selection step first
 */
async function analyzeUploadedVideo() {
    if (!uploadedVideoUrl) {
        showStatus('Please upload a video first.', 'error');
        return;
    }

    console.log('🏌️ Starting club selection for uploaded video');

    // Reset selection state
    selectedClubPoint = null;
    clubTemplate = null;
    selectionMarker.style.display = 'none';
    confirmSelectionBtn.disabled = true;

    // Show club tracking section with selection step
    uploadSection.style.display = 'none';
    headtrackSection.style.display = 'block';
    headtrackClipSelection.style.display = 'none';
    headtrackSelectClub.style.display = 'block';
    headtrackProcessing.style.display = 'none';
    headtrackResults.style.display = 'none';

    try {
        // Load the video for selection
        selectionVideo.src = uploadedVideoUrl;

        await new Promise((resolve, reject) => {
            selectionVideo.onloadedmetadata = resolve;
            selectionVideo.onerror = reject;
        });

        await new Promise((resolve) => {
            selectionVideo.oncanplaythrough = resolve;
            selectionVideo.load();
        });

        // Go to first frame
        selectionVideo.currentTime = 0;
        await new Promise(resolve => {
            selectionVideo.onseeked = resolve;
        });

        // Setup canvas for selection preview
        selectionCanvas.width = selectionVideo.videoWidth;
        selectionCanvas.height = selectionVideo.videoHeight;

    } catch (error) {
        console.error('❌ Failed to load video for selection:', error);
        alert('Failed to load video. Please try with a different video.');
        headtrackSection.style.display = 'none';
        uploadSection.style.display = 'block';
    }
}

/**
 * Handle tap/click on selection video to select club head
 */
function handleClubSelection(event) {
    const rect = selectionContainer.getBoundingClientRect();
    const scaleX = selectionVideo.videoWidth / rect.width;
    const scaleY = selectionVideo.videoHeight / rect.height;

    // Get tap position in video coordinates
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    selectedClubPoint = { x, y };

    // Show marker at tap position
    const markerX = event.clientX - rect.left;
    const markerY = event.clientY - rect.top;
    selectionMarker.style.left = markerX + 'px';
    selectionMarker.style.top = markerY + 'px';
    selectionMarker.style.display = 'block';

    // Extract template from current frame
    extractTemplate(x, y);

    // Enable confirm button
    confirmSelectionBtn.disabled = false;

    console.log(`📍 Club head selected at (${Math.round(x)}, ${Math.round(y)})`);
}

/**
 * Extract template image around the selected point
 */
function extractTemplate(x, y) {
    const canvas = document.createElement('canvas');
    canvas.width = selectionVideo.videoWidth;
    canvas.height = selectionVideo.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(selectionVideo, 0, 0);

    // Extract template region around the point
    const halfSize = TEMPLATE_SIZE / 2;
    const startX = Math.max(0, Math.round(x - halfSize));
    const startY = Math.max(0, Math.round(y - halfSize));

    clubTemplate = ctx.getImageData(startX, startY, TEMPLATE_SIZE, TEMPLATE_SIZE);
    console.log('📋 Template extracted');
}

/**
 * Start tracking after user confirms selection
 */
async function startClubTracking() {
    if (!selectedClubPoint || !clubTemplate) {
        alert('Please tap on the club head first.');
        return;
    }

    console.log('🏌️ Starting club path tracking...');

    // Hide selection, show processing
    headtrackSelectClub.style.display = 'none';
    headtrackProcessing.style.display = 'block';
    headtrackProgress.style.width = '0%';
    headtrackProgressText.textContent = '0% - Loading video...';

    try {
        // Load video for tracking
        headtrackVideo.src = uploadedVideoUrl;

        await new Promise((resolve, reject) => {
            headtrackVideo.onloadedmetadata = resolve;
            headtrackVideo.onerror = reject;
        });

        await new Promise((resolve) => {
            headtrackVideo.oncanplaythrough = resolve;
            headtrackVideo.load();
        });

        headtrackProgressText.textContent = '10% - Tracking club head...';
        headtrackProgress.style.width = '10%';

        // Track the club head through frames using template matching
        await trackClubWithTemplate();

        // Show results
        headtrackProcessing.style.display = 'none';
        headtrackResults.style.display = 'block';

        // Setup canvas
        setupHeadtrackCanvas();

        // Calculate stats
        calculateClubStats();

        // Start at beginning
        headtrackVideo.currentTime = 0;

    } catch (error) {
        console.error('❌ Club tracking failed:', error);
        alert('Club tracking failed. Try selecting a different point on the club.');
        headtrackProcessing.style.display = 'none';
        headtrackSelectClub.style.display = 'block';
    }
}

/**
 * Track club head through video using template matching
 */
async function trackClubWithTemplate() {
    const video = headtrackVideo;
    const duration = video.duration;
    const fps = 30;
    const totalFrames = Math.floor(duration * fps);

    headPositions = [];

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Start from the initially selected point
    let currentX = selectedClubPoint.x;
    let currentY = selectedClubPoint.y;
    const searchRadius = 60; // Search area around last known position

    for (let i = 0; i <= totalFrames; i++) {
        const time = (i / fps);
        video.currentTime = time;

        await new Promise(resolve => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
            };
            video.addEventListener('seeked', onSeeked);
        });

        ctx.drawImage(video, 0, 0);

        // Search for template around last known position
        const match = findTemplateMatch(ctx, currentX, currentY, searchRadius);

        if (match) {
            currentX = match.x;
            currentY = match.y;
            headPositions.push({
                time: time,
                x: match.x,
                y: match.y,
                confidence: match.confidence,
                detected: true
            });
        } else {
            // Template not found - use last position
            headPositions.push({
                time: time,
                x: currentX,
                y: currentY,
                confidence: 0,
                detected: false
            });
        }

        // Update progress
        const progress = 10 + (i / totalFrames) * 85;
        headtrackProgress.style.width = `${progress}%`;
        headtrackProgressText.textContent = `${Math.round(progress)}% - Frame ${i + 1}/${totalFrames + 1}`;
    }

    headtrackProgress.style.width = '100%';
    headtrackProgressText.textContent = '100% - Complete!';

    console.log(`✅ Tracked ${headPositions.length} frames`);
}

/**
 * Find template match in a search area around the given position
 */
function findTemplateMatch(ctx, centerX, centerY, searchRadius) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const halfTemplate = TEMPLATE_SIZE / 2;

    let bestMatch = null;
    let bestScore = Infinity;

    // Search in a grid around the center position
    const step = 4; // Check every 4 pixels for speed
    for (let dy = -searchRadius; dy <= searchRadius; dy += step) {
        for (let dx = -searchRadius; dx <= searchRadius; dx += step) {
            const testX = Math.round(centerX + dx);
            const testY = Math.round(centerY + dy);

            // Check bounds
            if (testX - halfTemplate < 0 || testX + halfTemplate > width ||
                testY - halfTemplate < 0 || testY + halfTemplate > height) {
                continue;
            }

            // Get image data at this position
            const testData = ctx.getImageData(
                testX - halfTemplate,
                testY - halfTemplate,
                TEMPLATE_SIZE,
                TEMPLATE_SIZE
            );

            // Calculate sum of squared differences
            const score = calculateSSD(clubTemplate, testData);

            if (score < bestScore) {
                bestScore = score;
                bestMatch = { x: testX, y: testY, confidence: 1 - (score / 1000000) };
            }
        }
    }

    // Only return match if confidence is good enough
    if (bestMatch && bestMatch.confidence > 0.3) {
        return bestMatch;
    }

    return null;
}

/**
 * Calculate Sum of Squared Differences between two image patches
 */
function calculateSSD(template, test) {
    let ssd = 0;
    const data1 = template.data;
    const data2 = test.data;

    for (let i = 0; i < data1.length; i += 4) {
        // Compare grayscale values
        const gray1 = (data1[i] + data1[i + 1] + data1[i + 2]) / 3;
        const gray2 = (data2[i] + data2[i + 1] + data2[i + 2]) / 3;
        const diff = gray1 - gray2;
        ssd += diff * diff;
    }

    return ssd;
}

/**
 * Cancel selection and go back
 */
function cancelClubSelection() {
    headtrackSection.style.display = 'none';
    uploadSection.style.display = 'block';
    selectedClubPoint = null;
    clubTemplate = null;
}

/**
 * Modified back function for uploaded videos
 */
function backFromHeadtrackToUpload() {
    headtrackSection.style.display = 'none';

    // If we came from upload, go back to upload section
    if (uploadedVideoUrl) {
        uploadSection.style.display = 'block';
    } else {
        resultsSection.style.display = 'block';
    }

    // Stop video and cleanup
    headtrackVideo.pause();
    headtrackVideo.src = '';
    if (selectionVideo) selectionVideo.src = '';
    isHeadtrackPlaying = false;
    headPositions = [];
    selectedClubPoint = null;
    clubTemplate = null;
}

// Helper function to safely add event listeners
function addClickListener(element, handler, name) {
    if (element) {
        element.addEventListener('click', handler);
    } else {
        console.error(`Element not found: ${name}`);
    }
}

// Event Listeners - wrapped for safety
try {
    // Recording controls
    addClickListener(startBtn, startRecording, 'start-btn');
    addClickListener(stopBtn, stopRecording, 'stop-btn');
    addClickListener(newSessionBtn, startNewSession, 'new-session-btn');

    // Mode selection event listeners
    addClickListener(sideBySideModeBtn, () => showClipSelection('sidebyside'), 'sidebyside-mode-btn');
    addClickListener(overlayModeBtn, () => showClipSelection('overlay'), 'overlay-mode-btn');
    addClickListener(positionModeBtn, () => showClipSelection('position'), 'position-mode-btn');
    addClickListener(headtrackModeBtn, showHeadTrackingMode, 'headtrack-mode-btn');

    // Clip selection and comparison event listeners
    addClickListener(createComparisonBtn, createComparison, 'create-comparison-btn');
    addClickListener(backToResultsBtn, backToResults, 'back-to-results-btn');
    addClickListener(backToClipsBtn, backToClips, 'back-to-clips-btn');
    addClickListener(downloadResultBtn, downloadResult, 'download-result-btn');

    // Head tracking event listeners
    addClickListener(headtrackPlayBtn, toggleHeadtrackPlayback, 'headtrack-play-btn');
    addClickListener(headtrackResetBtn, resetHeadtrackVideo, 'headtrack-reset-btn');
    addClickListener(headtrackBackBtn, backFromHeadtrackToUpload, 'headtrack-back-btn');
    if (headtrackShowTrace) headtrackShowTrace.addEventListener('change', drawHeadtrackOverlay);
    if (headtrackShowBox) headtrackShowBox.addEventListener('change', drawHeadtrackOverlay);

    // Club selection event listeners
    if (selectionContainer) {
        selectionContainer.addEventListener('click', handleClubSelection);
        selectionContainer.addEventListener('touchend', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            handleClubSelection({ clientX: touch.clientX, clientY: touch.clientY });
        });
    }
    addClickListener(confirmSelectionBtn, startClubTracking, 'confirm-selection-btn');
    addClickListener(cancelSelectionBtn, cancelClubSelection, 'cancel-selection-btn');

    // Start section event listeners - CRITICAL for initial user interaction
    addClickListener(startRecordBtn, showRecordingMode, 'start-record-btn');
    addClickListener(startUploadBtn, showUploadMode, 'start-upload-btn');
    addClickListener(backToStartBtn, showStartSection, 'back-to-start-btn');
    addClickListener(uploadBackToStartBtn, showStartSection, 'upload-back-to-start-btn');

    // Upload event listeners
    addClickListener(analyzeUploadBtn, analyzeUploadedVideo, 'analyze-upload-btn');
    addClickListener(clearUploadBtn, clearUpload, 'clear-upload-btn');

    // File upload handling - input overlays the upload area for iOS compatibility
    if (videoUpload) {
        videoUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    // Drag and drop handling
    if (uploadArea) {
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
    }

    console.log('✅ All event listeners registered successfully');
} catch (error) {
    console.error('❌ Error setting up event listeners:', error);
}

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
