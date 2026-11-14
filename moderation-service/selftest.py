"""Deployment gate: real model loading/inference and OCR/FFmpeg/speech smoke tests.

Does not read Firestore or publish anything. This is NOT a calibrated image-quality benchmark.
Run once in a separate container before starting the serving container.
"""
import math
import subprocess
import tempfile
import wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from app.classifier import (
    get_models, _nsfw_scores, _visual_scores, _ocr,
    _video_frames, _video_metadata, _video_transcript, _text_relevance,
)
from app.policy import embedded_text_flags, decision_from_flags
from app.schemas import ModerationRequest


def main():
    from pillow_heif import register_heif_opener
    register_heif_opener()
    models = get_models()
    models.whisper_model()
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        image = Image.new('RGB', (1000, 400), 'white')
        drawing = ImageDraw.Draw(image)
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 90)
        drawing.text((50, 40), 'fuck', font=font, fill='black')
        drawing.text((50, 190), 'блядь', font=font, fill='black')
        photo = root / 'test.png'; image.save(photo)
        assert decision_from_flags(embedded_text_flags(_ocr(photo))) == 'rejected', 'OCR profanity check failed'
        scores = _nsfw_scores([image], models)
        assert len(scores) == 1 and math.isfinite(scores[0]) and 0 <= scores[0] <= 1, 'NSFW model failed'
        visual = _visual_scores([image], 'Экскаваторы', models, ['Каркасные дома'])
        assert len(visual) == 1 and math.isfinite(visual[0]['category']), 'CLIP model failed'
        request = ModerationRequest(title='Продажа пассажирского вертолёта',
            description='Продаю пассажирский вертолёт для полётов, воздушное судно, авиационная техника',
            catalog={'section': 'equipment', 'category': 'Спецтехника', 'subcategory': 'Экскаваторы',
                     'alternatives': ['Экскаваторы', 'Автокраны', 'Каркасные дома']})
        flags, _ = _text_relevance(request, models)
        assert decision_from_flags(flags) != 'approved', 'Outside-catalog test was incorrectly approved'
        wav = root / 'silence.wav'
        with wave.open(str(wav), 'wb') as output:
            output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000)
            output.writeframes(np.zeros(32000, dtype=np.int16).tobytes())
        video = root / 'test.mp4'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-loop', '1', '-i', str(photo), '-i', str(wav),
                        '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(video)], check=True, timeout=30)
        duration, has_audio = _video_metadata(video)
        assert duration > 0 and has_audio
        assert _video_frames(video, root, duration), 'Video frame extraction failed'
        _video_transcript(video, root, models)
    print('MODEL_SELFTEST_OK: text, CLIP, NSFW, RU/EN OCR, video frames, speech loaded and executed', flush=True)


if __name__ == '__main__':
    main()
