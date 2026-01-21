"""
French Audio Translator - Main FastAPI Application

A web app that continuously records audio, detects French speech,
and streams translations using TranslateGemma.
"""

import asyncio
import json
import logging
import os
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Check if we should use mock translator (for testing without GPU)
USE_MOCK = os.getenv("USE_MOCK_TRANSLATOR", "false").lower() == "true"

app = FastAPI(
    title="French Audio Translator",
    description="Real-time French to English translation using TranslateGemma",
    version="1.0.0",
)

# Mount static files
static_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
app.mount("/static", StaticFiles(directory=static_path), name="static")


class TranslationRequest(BaseModel):
    """Request model for translation endpoint."""
    text: str
    source_lang: str = "fr"
    target_lang: str = "en-US"


class TranslationResponse(BaseModel):
    """Response model for translation endpoint."""
    original: str
    translation: str
    source_lang: str
    target_lang: str


class LanguageDetectionRequest(BaseModel):
    """Request model for language detection."""
    text: str


class LanguageDetectionResponse(BaseModel):
    """Response model for language detection."""
    text: str
    detected_language: str
    confidence: float
    is_french: bool


def detect_french(text: str) -> tuple[bool, float]:
    """
    Detect if text is French.

    Returns:
        Tuple of (is_french, confidence)
    """
    try:
        from langdetect import detect_langs
        results = detect_langs(text)
        for result in results:
            if result.lang == "fr":
                return True, result.prob
        return False, 0.0
    except Exception as e:
        logger.warning(f"Language detection failed: {e}")
        # Fallback: check for common French words
        french_indicators = [
            "je", "tu", "il", "elle", "nous", "vous", "ils", "elles",
            "le", "la", "les", "un", "une", "des", "de", "du",
            "est", "sont", "suis", "es", "sommes", "etes",
            "bonjour", "merci", "oui", "non", "avec", "pour",
            "que", "qui", "quoi", "comment", "pourquoi", "ou",
        ]
        words = text.lower().split()
        french_count = sum(1 for w in words if w in french_indicators)
        confidence = french_count / max(len(words), 1)
        return confidence > 0.3, confidence


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main application page."""
    index_path = os.path.join(static_path, "index.html")
    return FileResponse(index_path)


@app.post("/api/translate", response_model=TranslationResponse)
async def translate_text(request: TranslationRequest):
    """
    Translate text from French to English.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        if USE_MOCK:
            from app.translator import MockTranslator
            translation = MockTranslator.translate(request.text)
        else:
            from app.translator import translate_french_to_english
            translation = translate_french_to_english(request.text)

        return TranslationResponse(
            original=request.text,
            translation=translation,
            source_lang=request.source_lang,
            target_lang=request.target_lang,
        )
    except Exception as e:
        logger.error(f"Translation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/detect-language", response_model=LanguageDetectionResponse)
async def detect_language(request: LanguageDetectionRequest):
    """
    Detect if the provided text is French.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    is_french, confidence = detect_french(request.text)

    try:
        from langdetect import detect
        detected = detect(request.text)
    except Exception:
        detected = "fr" if is_french else "unknown"

    return LanguageDetectionResponse(
        text=request.text,
        detected_language=detected,
        confidence=confidence,
        is_french=is_french,
    )


@app.websocket("/ws/translate")
async def websocket_translate(websocket: WebSocket):
    """
    WebSocket endpoint for real-time streaming translation.

    Messages from client:
    - {"type": "translate", "text": "French text here"}
    - {"type": "detect", "text": "Text to detect language"}

    Messages to client:
    - {"type": "translation_start", "original": "French text"}
    - {"type": "translation_chunk", "chunk": "partial translation"}
    - {"type": "translation_end", "full_translation": "complete translation"}
    - {"type": "detection_result", "is_french": true, "confidence": 0.95}
    - {"type": "error", "message": "error description"}
    """
    await websocket.accept()
    logger.info("WebSocket client connected")

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)

            msg_type = message.get("type")
            text = message.get("text", "").strip()

            if not text:
                await websocket.send_json({
                    "type": "error",
                    "message": "Empty text received"
                })
                continue

            if msg_type == "detect":
                # Language detection
                is_french, confidence = detect_french(text)
                await websocket.send_json({
                    "type": "detection_result",
                    "text": text,
                    "is_french": is_french,
                    "confidence": confidence,
                })

            elif msg_type == "translate":
                # Streaming translation
                await websocket.send_json({
                    "type": "translation_start",
                    "original": text,
                })

                full_translation = ""
                try:
                    if USE_MOCK:
                        from app.translator import MockTranslator
                        async for chunk in MockTranslator.translate_stream(text):
                            full_translation += chunk
                            await websocket.send_json({
                                "type": "translation_chunk",
                                "chunk": chunk,
                            })
                    else:
                        from app.translator import translate_french_to_english_stream
                        async for chunk in translate_french_to_english_stream(text):
                            full_translation += chunk
                            await websocket.send_json({
                                "type": "translation_chunk",
                                "chunk": chunk,
                            })

                    await websocket.send_json({
                        "type": "translation_end",
                        "full_translation": full_translation.strip(),
                    })
                except Exception as e:
                    logger.error(f"Translation streaming error: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Translation failed: {str(e)}",
                    })

            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                })

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e),
            })
        except Exception:
            pass


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "mock_mode": USE_MOCK,
    }


@app.on_event("startup")
async def startup_event():
    """Pre-load the model on startup (if not in mock mode)."""
    if not USE_MOCK:
        logger.info("Pre-loading TranslateGemma model...")
        try:
            # Import to trigger lazy loading
            from app.translator import load_model
            # Load in background to not block startup
            asyncio.create_task(asyncio.to_thread(load_model))
        except Exception as e:
            logger.warning(f"Model pre-loading skipped: {e}")
    else:
        logger.info("Running in mock mode - no model will be loaded")
