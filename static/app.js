/**
 * French Audio Translator - Frontend Application
 *
 * Handles continuous audio recording, speech recognition,
 * French detection, and streaming translation via WebSocket.
 */

class FrenchAudioTranslator {
    constructor() {
        // State
        this.isListening = false;
        this.recognition = null;
        this.websocket = null;
        this.audioContext = null;
        this.analyser = null;
        this.mediaStream = null;
        this.animationId = null;

        // Settings
        this.autoTranslate = true;
        this.confidenceThreshold = 0.7;
        this.speechLang = 'fr-FR';

        // Translation history
        this.history = [];
        this.maxHistory = 10;

        // Current state
        this.currentTranscript = '';
        this.currentTranslation = '';
        this.isTranslating = false;

        // DOM Elements
        this.elements = {
            controlBtn: document.getElementById('controlBtn'),
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),
            transcriptBox: document.getElementById('transcriptBox'),
            translationBox: document.getElementById('translationBox'),
            langBadge: document.getElementById('langBadge'),
            visualizer: document.getElementById('visualizer'),
            errorBanner: document.getElementById('errorBanner'),
            settingsToggle: document.getElementById('settingsToggle'),
            settingsPanel: document.getElementById('settingsPanel'),
            autoTranslateToggle: document.getElementById('autoTranslate'),
            confidenceInput: document.getElementById('confidenceThreshold'),
            speechLangSelect: document.getElementById('speechLang'),
            historyCard: document.getElementById('historyCard'),
            historyList: document.getElementById('historyList'),
        };

        this.init();
    }

    init() {
        // Check browser support
        if (!this.checkBrowserSupport()) {
            return;
        }

        // Bind event listeners
        this.elements.controlBtn.addEventListener('click', () => this.toggleListening());
        this.elements.settingsToggle.addEventListener('click', () => this.toggleSettings());
        this.elements.autoTranslateToggle.addEventListener('change', (e) => {
            this.autoTranslate = e.target.checked;
        });
        this.elements.confidenceInput.addEventListener('change', (e) => {
            this.confidenceThreshold = parseFloat(e.target.value);
        });
        this.elements.speechLangSelect.addEventListener('change', (e) => {
            this.speechLang = e.target.value;
            if (this.recognition) {
                this.recognition.lang = this.speechLang || 'fr-FR';
            }
        });

        // Connect WebSocket
        this.connectWebSocket();
    }

    checkBrowserSupport() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            this.showError('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
            this.elements.controlBtn.disabled = true;
            return false;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.showError('Microphone access is not supported in this browser.');
            this.elements.controlBtn.disabled = true;
            return false;
        }

        return true;
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/translate`;

        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
            console.log('WebSocket connected');
        };

        this.websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };

        this.websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.websocket.onclose = () => {
            console.log('WebSocket disconnected, reconnecting...');
            setTimeout(() => this.connectWebSocket(), 2000);
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'detection_result':
                this.handleDetectionResult(data);
                break;
            case 'translation_start':
                this.isTranslating = true;
                this.currentTranslation = '';
                this.updateTranslationBox('');
                this.setStatus('processing', 'Translating...');
                break;
            case 'translation_chunk':
                this.currentTranslation += data.chunk;
                this.updateTranslationBox(this.currentTranslation);
                break;
            case 'translation_end':
                this.isTranslating = false;
                this.currentTranslation = data.full_translation;
                this.updateTranslationBox(this.currentTranslation);
                this.addToHistory(this.currentTranscript, this.currentTranslation);
                if (this.isListening) {
                    this.setStatus('listening', 'Listening...');
                } else {
                    this.setStatus('ready', 'Ready');
                }
                break;
            case 'error':
                this.showError(data.message);
                this.isTranslating = false;
                if (this.isListening) {
                    this.setStatus('listening', 'Listening...');
                }
                break;
        }
    }

    handleDetectionResult(data) {
        if (data.is_french && data.confidence >= this.confidenceThreshold) {
            this.elements.langBadge.textContent = `FRENCH (${Math.round(data.confidence * 100)}%)`;
            this.elements.langBadge.className = 'lang-badge french';
            this.elements.langBadge.style.display = 'inline-block';

            // Auto-translate if enabled
            if (this.autoTranslate && !this.isTranslating) {
                this.requestTranslation(data.text);
            }
        } else {
            this.elements.langBadge.textContent = 'NOT FRENCH';
            this.elements.langBadge.className = 'lang-badge other';
            this.elements.langBadge.style.display = 'inline-block';
        }
    }

    async toggleListening() {
        if (this.isListening) {
            this.stopListening();
        } else {
            await this.startListening();
        }
    }

    async startListening() {
        try {
            // Request microphone permission
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Setup audio visualization
            this.setupAudioVisualization();

            // Setup speech recognition
            this.setupSpeechRecognition();

            // Start recognition
            this.recognition.start();

            this.isListening = true;
            this.updateControlButton();
            this.setStatus('listening', 'Listening...');
            this.hideError();

        } catch (error) {
            console.error('Failed to start listening:', error);
            this.showError('Failed to access microphone. Please grant permission and try again.');
        }
    }

    stopListening() {
        if (this.recognition) {
            this.recognition.stop();
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.isListening = false;
        this.updateControlButton();
        this.setStatus('ready', 'Ready');
        this.resetVisualizer();
    }

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();

        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = this.speechLang || 'fr-FR';

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Update transcript display
            const displayText = finalTranscript || interimTranscript;
            this.updateTranscriptBox(displayText);

            // When we have a final result, process it
            if (finalTranscript) {
                this.currentTranscript = finalTranscript;
                this.processTranscript(finalTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);

            if (event.error === 'no-speech') {
                // This is normal, just continue listening
                return;
            }

            if (event.error === 'audio-capture') {
                this.showError('No microphone detected. Please connect a microphone.');
                this.stopListening();
            } else if (event.error === 'not-allowed') {
                this.showError('Microphone access denied. Please allow microphone access.');
                this.stopListening();
            }
        };

        this.recognition.onend = () => {
            // Restart recognition if still supposed to be listening
            if (this.isListening) {
                try {
                    this.recognition.start();
                } catch (e) {
                    // May fail if already started
                }
            }
        };
    }

    processTranscript(text) {
        if (!text.trim()) return;

        // Request language detection from backend
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'detect',
                text: text,
            }));
        }
    }

    requestTranslation(text) {
        if (!text.trim()) return;

        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'translate',
                text: text,
            }));
        }
    }

    setupAudioVisualization() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;

        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        source.connect(this.analyser);

        // Create canvas for visualization
        const canvas = document.createElement('canvas');
        canvas.width = this.elements.visualizer.clientWidth * 2;
        canvas.height = this.elements.visualizer.clientHeight * 2;
        this.elements.visualizer.innerHTML = '';
        this.elements.visualizer.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            this.animationId = requestAnimationFrame(draw);

            this.analyser.getByteFrequencyData(dataArray);

            ctx.fillStyle = '#334155';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;

                // Gradient from blue to purple
                const hue = 220 + (i / bufferLength) * 60;
                ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;

                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        };

        draw();
    }

    resetVisualizer() {
        this.elements.visualizer.innerHTML = '<span class="visualizer-placeholder">Audio visualization will appear here</span>';
    }

    updateControlButton() {
        if (this.isListening) {
            this.elements.controlBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
                Stop Listening
            `;
            this.elements.controlBtn.className = 'control-btn stop';
        } else {
            this.elements.controlBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                Start Listening
            `;
            this.elements.controlBtn.className = 'control-btn start';
        }
    }

    setStatus(state, text) {
        this.elements.statusDot.className = `status-dot ${state}`;
        this.elements.statusText.textContent = text;
    }

    updateTranscriptBox(text) {
        if (text) {
            this.elements.transcriptBox.textContent = text;
            this.elements.transcriptBox.classList.remove('empty');
        } else {
            this.elements.transcriptBox.textContent = 'Waiting for speech...';
            this.elements.transcriptBox.classList.add('empty');
        }
    }

    updateTranslationBox(text) {
        if (text) {
            this.elements.translationBox.textContent = text;
            this.elements.translationBox.classList.remove('empty');
        } else {
            this.elements.translationBox.textContent = 'Translation will appear here...';
            this.elements.translationBox.classList.add('empty');
        }
    }

    addToHistory(original, translation) {
        this.history.unshift({ original, translation, timestamp: new Date() });

        if (this.history.length > this.maxHistory) {
            this.history.pop();
        }

        this.renderHistory();
    }

    renderHistory() {
        if (this.history.length === 0) {
            this.elements.historyCard.style.display = 'none';
            return;
        }

        this.elements.historyCard.style.display = 'block';
        this.elements.historyList.innerHTML = this.history
            .map(item => `
                <div class="history-item">
                    <div class="original">${this.escapeHtml(item.original)}</div>
                    <div class="translation">${this.escapeHtml(item.translation)}</div>
                </div>
            `)
            .join('');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    toggleSettings() {
        this.elements.settingsPanel.classList.toggle('open');
    }

    showError(message) {
        this.elements.errorBanner.textContent = message;
        this.elements.errorBanner.classList.add('show');
        this.setStatus('error', 'Error');
    }

    hideError() {
        this.elements.errorBanner.classList.remove('show');
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.translator = new FrenchAudioTranslator();
});
