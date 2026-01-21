"""
TranslateGemma-based French to English translator with streaming support.
"""

import logging
from typing import AsyncGenerator, Optional
import torch
from threading import Lock

logger = logging.getLogger(__name__)

# Global model instance (lazy loaded)
_model = None
_processor = None
_model_lock = Lock()


def get_device() -> str:
    """Determine the best available device."""
    if torch.cuda.is_available():
        return "cuda"
    elif torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_model():
    """Load the TranslateGemma model lazily."""
    global _model, _processor

    with _model_lock:
        if _model is not None:
            return _model, _processor

        logger.info("Loading TranslateGemma-4b model...")

        from transformers import AutoProcessor, Gemma3ForConditionalGeneration

        model_id = "google/translategemma-4b-it"
        device = get_device()

        # Determine dtype based on device
        if device == "cuda":
            dtype = torch.bfloat16
        elif device == "mps":
            dtype = torch.float16
        else:
            dtype = torch.float32

        _processor = AutoProcessor.from_pretrained(model_id)
        _model = Gemma3ForConditionalGeneration.from_pretrained(
            model_id,
            torch_dtype=dtype,
            device_map="auto" if device == "cuda" else None,
        )

        if device != "cuda":
            _model = _model.to(device)

        logger.info(f"Model loaded successfully on {device}")
        return _model, _processor


def translate_french_to_english(text: str) -> str:
    """
    Translate French text to English using TranslateGemma.

    Args:
        text: French text to translate

    Returns:
        Translated English text
    """
    model, processor = load_model()
    device = get_device()

    # Prepare the message in TranslateGemma format
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "source_lang_code": "fr",
                    "target_lang_code": "en-US",
                    "text": text,
                }
            ],
        }
    ]

    # Apply chat template
    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    )

    if device != "cuda":
        inputs = {k: v.to(device) if hasattr(v, 'to') else v for k, v in inputs.items()}

    # Generate translation
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=512,
            do_sample=False,
            pad_token_id=processor.tokenizer.pad_token_id,
        )

    # Decode only the new tokens
    input_len = inputs["input_ids"].shape[-1]
    generated_tokens = outputs[0][input_len:]
    translation = processor.decode(generated_tokens, skip_special_tokens=True)

    return translation.strip()


async def translate_french_to_english_stream(text: str) -> AsyncGenerator[str, None]:
    """
    Translate French text to English with streaming output.

    Args:
        text: French text to translate

    Yields:
        Translated text tokens as they're generated
    """
    from transformers import TextIteratorStreamer
    from threading import Thread

    model, processor = load_model()
    device = get_device()

    # Prepare the message in TranslateGemma format
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "source_lang_code": "fr",
                    "target_lang_code": "en-US",
                    "text": text,
                }
            ],
        }
    ]

    # Apply chat template
    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    )

    if device != "cuda":
        inputs = {k: v.to(device) if hasattr(v, 'to') else v for k, v in inputs.items()}

    # Setup streaming
    streamer = TextIteratorStreamer(
        processor.tokenizer,
        skip_prompt=True,
        skip_special_tokens=True,
    )

    generation_kwargs = {
        **inputs,
        "max_new_tokens": 512,
        "do_sample": False,
        "streamer": streamer,
        "pad_token_id": processor.tokenizer.pad_token_id,
    }

    # Run generation in a separate thread
    thread = Thread(target=model.generate, kwargs=generation_kwargs)
    thread.start()

    # Yield tokens as they're generated
    for token in streamer:
        if token:
            yield token

    thread.join()


class MockTranslator:
    """
    Mock translator for testing without GPU/model.
    Uses simple word substitution for demonstration.
    """

    MOCK_TRANSLATIONS = {
        "bonjour": "hello",
        "monde": "world",
        "comment": "how",
        "allez": "are",
        "vous": "you",
        "je": "I",
        "suis": "am",
        "merci": "thank you",
        "oui": "yes",
        "non": "no",
        "bien": "well",
        "tres": "very",
        "aujourd'hui": "today",
    }

    @classmethod
    def translate(cls, text: str) -> str:
        """Simple mock translation."""
        words = text.lower().split()
        translated = []
        for word in words:
            clean_word = word.strip(".,!?")
            if clean_word in cls.MOCK_TRANSLATIONS:
                translated.append(cls.MOCK_TRANSLATIONS[clean_word])
            else:
                translated.append(f"[{word}]")
        return " ".join(translated)

    @classmethod
    async def translate_stream(cls, text: str) -> AsyncGenerator[str, None]:
        """Mock streaming translation."""
        import asyncio
        translation = cls.translate(text)
        words = translation.split()
        for word in words:
            yield word + " "
            await asyncio.sleep(0.1)  # Simulate generation delay
