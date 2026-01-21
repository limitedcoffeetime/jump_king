/**
 * Live Audio Translator
 *
 * A client-side web app that:
 * - Continuously records audio using Web Speech API
 * - Sends transcribed text to TranslateGemma via HuggingFace Inference API
 * - Streams translations back in real-time
 *
 * No backend required - runs entirely in the browser!
 */

class LiveAudioTranslator {
    constructor() {
        // State
        this.isListening = false;
        this.recognition = null;
        this.audioContext = null;
        this.analyser = null;
        this.mediaStream = null;
        this.animationId = null;
        this.isTranslating = false;

        // Settings
        this.hfToken = localStorage.getItem('hf_token') || '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';
        this.sourceLang = '';  // Auto-detect
        this.targetLang = 'en-US';

        // Translation state
        this.currentTranscript = '';
        this.currentTranslation = '';

        // History
        this.history = [];
        this.maxHistory = 10;

        // HuggingFace API config
        this.HF_MODEL = 'google/translategemma-4b-it';
        this.HF_API_URL = `https://api-inference.huggingface.co/models/${this.HF_MODEL}`;

        // Language code mapping for TranslateGemma
        this.langCodeMap = {
            'en-US': 'en-US',
            'en-GB': 'en-GB',
            'fr-FR': 'fr',
            'es-ES': 'es',
            'de-DE': 'de-DE',
            'it-IT': 'it',
            'pt-BR': 'pt-BR',
            'zh-CN': 'zh-CN',
            'ja-JP': 'ja',
            'ko-KR': 'ko',
            'ru-RU': 'ru',
            'ar-SA': 'ar',
        };

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
            hfToken: document.getElementById('hfToken'),
            tokenSaved: document.getElementById('tokenSaved'),
            sourceLang: document.getElementById('sourceLang'),
            targetLang: document.getElementById('targetLang'),
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

        // Load saved token
        if (this.hfToken) {
            this.elements.hfToken.value = this.hfToken;
            this.elements.tokenSaved.style.display = 'block';
        }

        // Bind event listeners
        this.elements.controlBtn.addEventListener('click', () => this.toggleListening());
        this.elements.settingsToggle.addEventListener('click', () => this.toggleSettings());

        this.elements.hfToken.addEventListener('change', (e) => {
            this.hfToken = e.target.value.trim();
            if (this.hfToken) {
                localStorage.setItem('hf_token', this.hfToken);
                this.elements.tokenSaved.style.display = 'block';
            } else {
                localStorage.removeItem('hf_token');
                this.elements.tokenSaved.style.display = 'none';
            }
        });

        this.elements.sourceLang.addEventListener('change', (e) => {
            this.sourceLang = e.target.value;
            if (this.recognition) {
                this.recognition.lang = this.sourceLang || 'fr-FR';
            }
        });

        this.elements.targetLang.addEventListener('change', (e) => {
            this.targetLang = e.target.value;
        });
    }

    checkBrowserSupport() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            this.showError('Speech recognition is not supported. Please use Chrome, Edge, or Safari.');
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

    async toggleListening() {
        if (this.isListening) {
            this.stopListening();
        } else {
            await this.startListening();
        }
    }

    async startListening() {
        // Check for HF token
        if (!this.hfToken) {
            this.showError('Please enter your Hugging Face API token first.');
            return;
        }

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
            if (error.name === 'NotAllowedError') {
                this.showError('Microphone access denied. Please allow microphone access and reload.');
            } else {
                this.showError('Failed to access microphone: ' + error.message);
            }
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
        this.recognition.lang = this.sourceLang || 'fr-FR';  // Default to French if not set

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

            // Show detected language badge
            if (displayText) {
                const detectedLang = this.recognition.lang.split('-')[0].toUpperCase();
                this.elements.langBadge.textContent = detectedLang || 'AUTO';
                this.elements.langBadge.style.display = 'inline-block';
            }

            // When we have a final result, translate it
            if (finalTranscript && !this.isTranslating) {
                this.currentTranscript = finalTranscript;
                this.translateText(finalTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);

            if (event.error === 'no-speech') {
                return;  // Normal, just continue
            }

            if (event.error === 'audio-capture') {
                this.showError('No microphone detected.');
                this.stopListening();
            } else if (event.error === 'not-allowed') {
                this.showError('Microphone access denied.');
                this.stopListening();
            } else if (event.error === 'network') {
                this.showError('Network error in speech recognition.');
            }
        };

        this.recognition.onend = () => {
            if (this.isListening) {
                try {
                    this.recognition.start();
                } catch (e) {
                    // May fail if already started
                }
            }
        };
    }

    async translateText(text) {
        if (!text.trim() || this.isTranslating) return;

        this.isTranslating = true;
        this.currentTranslation = '';
        this.setStatus('processing', 'Translating...');
        this.updateTranslationBox('', true);  // Show cursor

        try {
            // Determine source language code
            // Use the speech recognition's detected/configured language
            const sourceLangCode = this.langCodeMap[this.sourceLang] || 'fr';  // Default to French
            const targetLangCode = this.langCodeMap[this.targetLang] || 'en-US';

            // Build the prompt for TranslateGemma
            const prompt = this.buildTranslationPrompt(text, sourceLangCode, targetLangCode);

            // Call HuggingFace Inference API with streaming
            const response = await fetch(this.HF_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.hfToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 512,
                        do_sample: false,
                        return_full_text: false,
                    },
                    options: {
                        wait_for_model: true,
                    }
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `API error: ${response.status}`);
            }

            const result = await response.json();

            // Extract translation from response
            let translation = '';
            if (Array.isArray(result) && result[0]?.generated_text) {
                translation = result[0].generated_text;
            } else if (result.generated_text) {
                translation = result.generated_text;
            } else {
                translation = JSON.stringify(result);
            }

            // Clean up the translation
            translation = this.cleanTranslation(translation);

            this.currentTranslation = translation;
            this.updateTranslationBox(translation, false);
            this.addToHistory(text, translation);

        } catch (error) {
            console.error('Translation error:', error);

            if (error.message.includes('401')) {
                this.showError('Invalid API token. Please check your Hugging Face token.');
            } else if (error.message.includes('503')) {
                this.showError('Model is loading. Please wait a moment and try again.');
                // Retry after a delay
                setTimeout(() => this.translateText(text), 5000);
                return;
            } else {
                this.showError('Translation failed: ' + error.message);
            }

            this.updateTranslationBox('Translation failed', false);
        } finally {
            this.isTranslating = false;
            if (this.isListening) {
                this.setStatus('listening', 'Listening...');
            } else {
                this.setStatus('ready', 'Ready');
            }
        }
    }

    buildTranslationPrompt(text, sourceLang, targetLang) {
        // TranslateGemma uses a specific chat format
        // Based on the model documentation
        return `<start_of_turn>user
Translate the following text from ${sourceLang} to ${targetLang}:

${text}<end_of_turn>
<start_of_turn>model
`;
    }

    cleanTranslation(text) {
        // Remove any model artifacts
        let cleaned = text
            .replace(/<end_of_turn>/g, '')
            .replace(/<start_of_turn>model/g, '')
            .replace(/<start_of_turn>user/g, '')
            .trim();

        // Remove quotes if the entire response is quoted
        if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
            (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
            cleaned = cleaned.slice(1, -1);
        }

        return cleaned;
    }

    setupAudioVisualization() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;

        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        source.connect(this.analyser);

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

    updateTranslationBox(text, showCursor = false) {
        if (text || showCursor) {
            this.elements.translationBox.innerHTML = this.escapeHtml(text) +
                (showCursor ? '<span class="streaming-cursor"></span>' : '');
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
    }

    hideError() {
        this.elements.errorBanner.classList.remove('show');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.translator = new LiveAudioTranslator();
});
