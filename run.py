#!/usr/bin/env python3
"""
Simple startup script for the Live Audio Translator.

This just serves the static files. All translation logic
runs in the browser via the HuggingFace Inference API.
"""

import argparse
import uvicorn


def main():
    parser = argparse.ArgumentParser(
        description="Live Audio Translator - Serve the static web app"
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host to bind to (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to bind to (default: 8000)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development",
    )

    args = parser.parse_args()

    print(f"Starting server at http://{args.host}:{args.port}")
    print("Open this URL on your phone to use the translator")
    print("\nNote: You'll need a HuggingFace API token to use translation.")
    print("Get one free at: https://huggingface.co/settings/tokens")

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
