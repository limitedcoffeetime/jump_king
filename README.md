# Live Audio Translator

A **client-side** web app that continuously listens to audio, transcribes speech in any language, and translates to English using Google's TranslateGemma model via the HuggingFace Inference API.

**No backend required** - runs entirely in your browser!

## Features

- Continuous audio recording with visual feedback
- Speech-to-text using the Web Speech API (works in Chrome, Edge, Safari)
- Translation via TranslateGemma-4b through HuggingFace's free Inference API
- Supports 10+ source languages
- Mobile-optimized dark theme UI
- Translation history
- Token saved locally in browser

## Quick Start

### Option 1: Use any static file server

The app is just HTML + JS, so you can serve it with any web server:

```bash
# Python
cd static && python -m http.server 8000

# Node
npx serve static

# Or just open static/index.html directly (some features may be limited)
```

### Option 2: Use the included FastAPI server

```bash
pip install -r requirements.txt
python run.py
```

Then open http://localhost:8000 on your phone or browser.

## Setup

1. **Get a HuggingFace API Token** (free):
   - Go to https://huggingface.co/settings/tokens
   - Create a new token (read access is sufficient)
   - Paste it into the app

2. **Accept the TranslateGemma license**:
   - Visit https://huggingface.co/google/translategemma-4b-it
   - Click "Agree and access repository"

3. **Open the app** and start listening!

## How It Works

```
┌─────────────────────┐
│   Your Browser      │
│                     │
│  ┌───────────────┐  │
│  │ Web Speech API│  │  ← Transcribes audio to text
│  └───────┬───────┘  │
│          │          │
│          ▼          │
│  ┌───────────────┐  │
│  │  JavaScript   │──┼──→ HuggingFace Inference API
│  │  (app.js)     │←─┼─── (TranslateGemma-4b)
│  └───────┬───────┘  │
│          │          │
│          ▼          │
│  ┌───────────────┐  │
│  │  Translation  │  │  ← Displays result
│  │    Display    │  │
│  └───────────────┘  │
└─────────────────────┘
```

1. **Audio capture**: Browser's Web Audio API captures microphone input
2. **Speech recognition**: Web Speech API transcribes audio to text
3. **Translation**: Text is sent to HuggingFace's hosted TranslateGemma model
4. **Display**: Translation appears in the UI

## Supported Languages

**Source languages** (what you speak):
- French, Spanish, German, Italian, Portuguese
- Chinese, Japanese, Korean
- Russian, Arabic
- Auto-detect mode

**Target languages**:
- English (default), French, Spanish, German
- Chinese, Japanese

## Hosting Options

Since this is a static site, you can host it anywhere:

- **GitHub Pages**: Push to a repo and enable Pages
- **Netlify/Vercel**: Connect your repo for automatic deploys
- **Any web server**: nginx, Apache, Caddy, etc.

Just serve the `static/` folder!

## Browser Compatibility

| Browser | Speech Recognition | Status |
|---------|-------------------|--------|
| Chrome  | Yes | Fully supported |
| Edge    | Yes | Fully supported |
| Safari  | Yes | Fully supported |
| Firefox | No  | Translation works, but no speech input |

## Troubleshooting

### "Model is loading, please wait"
The HuggingFace Inference API spins down idle models. First request after inactivity takes 20-60 seconds. The app retries automatically.

### "Invalid API token"
- Make sure you copied the full token (starts with `hf_`)
- Check that you've accepted the TranslateGemma license

### "Microphone access denied"
- Click the lock icon in your browser's address bar
- Enable microphone permissions
- On iOS Safari, you may need to reload after granting permission

### Speech recognition not working
- Use Chrome, Edge, or Safari
- Firefox doesn't support the Web Speech API
- Ensure you're on HTTPS (or localhost)

## Privacy

- Audio is processed locally by your browser's Speech API
- Only transcribed text is sent to HuggingFace for translation
- Your HF token is stored only in your browser's localStorage
- No data is sent to any other server

## License

MIT
