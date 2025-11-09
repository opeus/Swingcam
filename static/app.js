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

// Comparison elements
const compareBtn = document.getElementById('compare-btn');
const selectedCountSpan = document.getElementById('selected-count');
const comparisonSection = document.getElementById('comparison-section');
const comparisonGrid = document.getElementById('comparison-grid');
const backToClipsBtn = document.getElementById('back-to-clips-btn');

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
 * Display processed clips
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
    updateSelectedCount();

    // Add each clip
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

        // Create clip element
        const clipItem = document.createElement('div');
        clipItem.className = 'clip-item';
        clipItem.dataset.clipIndex = index;

        clipItem.innerHTML = `
            <div class="clip-header">
                <label class="clip-select">
                    <input type="checkbox" class="clip-checkbox" data-index="${index}">
                    <span class="checkbox-label">Select</span>
                </label>
                <h4>Swing ${index + 1}</h4>
            </div>
            <video controls loop playsinline>
                <source src="${url}" type="video/mp4">
                Your browser does not support video playback.
            </video>
            <p class="clip-time">Detected at ${minutes}:${seconds.padStart(4, '0')}</p>
        `;

        // Add checkbox event listener
        const checkbox = clipItem.querySelector('.clip-checkbox');
        checkbox.addEventListener('change', handleClipSelection);

        clipsGrid.appendChild(clipItem);
        console.log(`✅ Added clip ${index + 1}: ${url}`);
    });

    console.log('🎉 All clips displayed!');
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
    recordingSection.style.display = 'block';
    swingsList.style.display = 'none';
    swingTimestamps.innerHTML = '';
    statusDiv.className = 'status';

    // Reset state
    detectedSwings = [];
    recordedChunks = [];
    selectedClips = [];
    allClips = [];
    updateSwingCount();

    showStatus('Ready to record! Press "Start Recording" when ready.', 'info');
}

/**
 * Handle clip selection checkbox change
 */
function handleClipSelection(event) {
    const index = parseInt(event.target.dataset.index);
    const isChecked = event.target.checked;

    if (isChecked) {
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
    compareBtn.disabled = selectedClips.length < 2;
}

/**
 * Show comparison view with selected clips
 */
async function showComparison() {
    if (selectedClips.length < 2) return;
    if (selectedClips.length > 3) {
        alert('Please select 2-3 clips for comparison');
        return;
    }

    // Hide results, show loading
    resultsSection.style.display = 'none';
    processingSection.style.display = 'block';

    try {
        console.log('🎬 Creating server-side comparison video...');

        // Extract clip filenames from URLs
        const clipFilenames = selectedClips.map(clip => {
            const urlParts = clip.url.split('/');
            return urlParts[urlParts.length - 1];
        });

        console.log('📋 Clip filenames:', clipFilenames);

        // Create form data
        const formData = new FormData();
        formData.append('clips', JSON.stringify(clipFilenames));

        // Request comparison video from server
        const response = await fetch('/api/compare', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ Comparison created:', result);

        if (result.success && result.comparison_url) {
            // Show comparison view with single combined video
            processingSection.style.display = 'none';
            comparisonSection.style.display = 'block';

            // Clear comparison grid
            comparisonGrid.innerHTML = '';

            // Create single comparison video element
            const compareItem = document.createElement('div');
            compareItem.className = 'compare-item-full';

            compareItem.innerHTML = `
                <video class="compare-video" controls loop playsinline webkit-playsinline>
                    <source src="${result.comparison_url}" type="video/mp4">
                    Your browser does not support video playback.
                </video>
            `;

            comparisonGrid.appendChild(compareItem);

            console.log(`🎉 Comparison video ready: ${result.comparison_url}`);
        } else {
            throw new Error('Failed to create comparison video');
        }

    } catch (error) {
        console.error('❌ Comparison error:', error);
        processingSection.style.display = 'none';
        resultsSection.style.display = 'block';
        alert(`Error creating comparison: ${error.message}`);
    }
}

/**
 * Go back to clips view from comparison
 */
function backToClips() {
    comparisonSection.style.display = 'none';
    resultsSection.style.display = 'block';
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
newSessionBtn.addEventListener('click', startNewSession);

// Comparison event listeners
compareBtn.addEventListener('click', showComparison);
backToClipsBtn.addEventListener('click', backToClips);

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
