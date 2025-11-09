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

// State
let mediaStream = null;
let mediaRecorder = null;
let audioContext = null;
let analyser = null;
let recordedChunks = [];
let detectedSwings = [];
let recordingStartTime = null;
let isRecording = false;

// Audio detection configuration
const DETECTION_CONFIG = {
    threshold: 0.15,       // Volume threshold (0-1) - VERY SENSITIVE
    cooldown: 800,         // Minimum ms between detections
    smoothing: 0.8,        // Audio analyzer smoothing
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

    // Clear previous clips
    clipsGrid.innerHTML = '';

    // Add each clip
    clipUrls.forEach((url, index) => {
        const clipItem = document.createElement('div');
        clipItem.className = 'clip-item';

        const timestamp = timestamps[index];
        const minutes = Math.floor(timestamp / 60);
        const seconds = (timestamp % 60).toFixed(1);

        clipItem.innerHTML = `
            <h4>Swing ${index + 1}</h4>
            <video controls loop>
                <source src="${url}" type="video/mp4">
                Your browser does not support video playback.
            </video>
            <p class="clip-time">Detected at ${minutes}:${seconds.padStart(4, '0')}</p>
        `;

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
    recordingSection.style.display = 'block';
    swingsList.style.display = 'none';
    swingTimestamps.innerHTML = '';
    statusDiv.className = 'status';

    // Reset state
    detectedSwings = [];
    recordedChunks = [];
    updateSwingCount();

    showStatus('Ready to record! Press "Start Recording" when ready.', 'info');
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
newSessionBtn.addEventListener('click', startNewSession);

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
