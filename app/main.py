"""
Live Audio Translator - Simple Static File Server

The translation logic runs entirely in the browser using the
HuggingFace Inference API. This server just serves the static files.

For production, you can host the static/ folder on any web server
or static hosting service (GitHub Pages, Netlify, Vercel, etc.)
"""

import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI(
    title="Live Audio Translator",
    description="Real-time audio translation using TranslateGemma",
    version="2.0.0",
)

# Get the static directory path
static_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")


@app.get("/")
async def root():
    """Serve the main application page."""
    return FileResponse(os.path.join(static_path, "index.html"))


# Mount static files
app.mount("/static", StaticFiles(directory=static_path), name="static")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}
