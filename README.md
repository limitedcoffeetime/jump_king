# French Audio Translator

A real-time web application that continuously listens to audio, intelligently detects French speech, and streams translations to English using Google's TranslateGemma-4b model.

## Features

- **Continuous Audio Recording**: Always-on listening through your device's microphone
- **Intelligent French Detection**: Automatically detects when French is being spoken using the Web Speech API and language detection
- **Real-time Streaming Translation**: Translations stream token-by-token as they're generated
- **Mobile-Optimized UI**: Responsive design works great on phones
- **Audio Visualization**: Visual feedback showing audio input levels
- **Translation History**: Keep track of recent translations

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Web Browser   │────▶│  FastAPI Server  │────▶│  TranslateGemma-4b  │
│  (Phone/Desktop)│◀────│   (WebSocket)    │◀────│      (GPU/CPU)      │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
        │
        ▼
┌─────────────────┐
│ Web Speech API  │
│  (STT in browser)│
└─────────────────┘
```

## Requirements

- Python 3.10+
- CUDA-capable GPU (recommended) or CPU
- Modern web browser (Chrome, Edge, or Safari recommended for Speech API)

## Installation

1. **Clone and navigate to the project:**
   ```bash
   cd french-audio-translator
   ```

2. **Create a virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Accept the model license:**

   You need to accept the license for TranslateGemma on Hugging Face:
   https://huggingface.co/google/translategemma-4b-it

## Usage

### With GPU (Full Translation)

```bash
python run.py
```

The server will start and pre-load the TranslateGemma model. Open `http://localhost:8000` in your browser.

### Mock Mode (Testing Without GPU)

```bash
python run.py --mock
```

This runs a simple mock translator for testing the UI without requiring a GPU.

### Development Mode

```bash
python run.py --reload
```

Enables auto-reload when code changes.

### Custom Host/Port

```bash
python run.py --host 0.0.0.0 --port 8080
```

### Accessing from Phone

1. Find your computer's local IP address:
   ```bash
   # Linux/Mac
   hostname -I

   # Windows
   ipconfig
   ```

2. Start the server bound to all interfaces:
   ```bash
   python run.py --host 0.0.0.0
   ```

3. On your phone, open: `http://<your-computer-ip>:8000`

**Note:** For HTTPS (required for microphone access on some mobile browsers), you'll need to set up a reverse proxy with SSL (e.g., nginx with Let's Encrypt) or use a tool like ngrok.

## How It Works

1. **Audio Capture**: The browser captures audio from your device's microphone using the Web Audio API.

2. **Speech Recognition**: The Web Speech API transcribes audio to text in real-time, with the language hint set to French.

3. **Language Detection**: When a complete phrase is detected, it's sent to the backend for language detection using the `langdetect` library.

4. **Translation**: If French is detected with sufficient confidence, the text is sent to TranslateGemma for translation.

5. **Streaming Response**: Translation tokens stream back via WebSocket and display in real-time.

## Configuration

### Frontend Settings

- **Auto-translate French**: Automatically translate when French is detected
- **Confidence threshold**: Minimum confidence level for French detection (0.0-1.0)
- **Speech language hint**: Set to French for better recognition, or auto-detect

### Environment Variables

- `USE_MOCK_TRANSLATOR`: Set to "true" to use mock translator

## API Endpoints

### REST API

- `GET /` - Main application page
- `POST /api/translate` - Translate text
- `POST /api/detect-language` - Detect language of text
- `GET /api/health` - Health check

### WebSocket

- `WS /ws/translate` - Real-time translation stream

**WebSocket Message Types:**

*Client → Server:*
```json
{"type": "translate", "text": "Bonjour le monde"}
{"type": "detect", "text": "Some text"}
```

*Server → Client:*
```json
{"type": "translation_start", "original": "..."}
{"type": "translation_chunk", "chunk": "..."}
{"type": "translation_end", "full_translation": "..."}
{"type": "detection_result", "is_french": true, "confidence": 0.95}
{"type": "error", "message": "..."}
```

## Browser Compatibility

| Browser | Speech Recognition | Audio Recording |
|---------|-------------------|-----------------|
| Chrome  | Yes               | Yes             |
| Edge    | Yes               | Yes             |
| Safari  | Yes               | Yes             |
| Firefox | No*               | Yes             |

*Firefox doesn't support the Web Speech API. Consider using a server-side speech-to-text solution like Whisper for Firefox support.

## Troubleshooting

### "Microphone access denied"
- Ensure you've granted microphone permissions in your browser
- On mobile, the page may need to be served over HTTPS

### "Speech recognition not supported"
- Use Chrome, Edge, or Safari
- Firefox doesn't support the Web Speech API

### "Model loading is slow"
- First load downloads ~8GB of model weights
- Subsequent loads are faster due to caching
- Use `--mock` flag for testing without the model

### "Out of memory"
- TranslateGemma-4b requires ~10GB VRAM
- Try using CPU (slower) or a quantized model version

## License

MIT License
