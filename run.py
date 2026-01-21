#!/usr/bin/env python3
"""
Startup script for the French Audio Translator application.
"""

import argparse
import os
import uvicorn


def main():
    parser = argparse.ArgumentParser(
        description="French Audio Translator - Real-time French to English translation"
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
        "--mock",
        action="store_true",
        help="Use mock translator (for testing without GPU)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development",
    )

    args = parser.parse_args()

    if args.mock:
        os.environ["USE_MOCK_TRANSLATOR"] = "true"
        print("Running in MOCK mode - no GPU required")
    else:
        print("Running with TranslateGemma model")

    print(f"Starting server at http://{args.host}:{args.port}")
    print("Open this URL on your phone to use the translator")

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
