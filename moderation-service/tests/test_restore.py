import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from PIL import Image
from fastapi.testclient import TestClient
from app import settings
from app.language_policy import contains_prohibited_language, contains_explicit_adult_text
from app.policy import embedded_text_flags, decision_from_flags
from app.classifier import _visual_alignment_flags, _ocr, _open_images, ClassificationResult
from app.security import trusted_media_url


class RestoredPolicyTests(unittest.TestCase):
    def test_shared_language_corpus(self):
        cases = json.loads(Path(__file__).with_name('language-cases.json').read_text())
        for label, expected in [('blocked', True), ('allowed', False)]:
            for text in cases[label]:
                with self.subTest(text=text):
                    self.assertEqual(contains_prohibited_language(text), expected)

    def test_ocr_and_audio_use_language_filter(self):
        for field in ['media.photo.1', 'media.video.1']:
            for text in ['blyat', 'f.u.c.k', 'блядь', 'pornography']:
                flags = embedded_text_flags(text, field)
                self.assertEqual(decision_from_flags(flags), 'rejected')

    def test_adult_filter_keeps_legitimate_numbers(self):
        self.assertFalse(contains_explicit_adult_text('Работаем 18 лет, ширина 18 мм'))
        self.assertTrue(contains_explicit_adult_text('Интимные услуги'))

    def test_different_object_is_rejected_uncertain_object_is_held(self):
        score = dict(category=.13, safe=.30, unrelated=.10, alternative=.40, alternativeLabel='Каркасные дома', listing=.12)
        flags, _, count = _visual_alignment_flags([score], 'Экскаваторы погрузчики', 'media')
        self.assertEqual(decision_from_flags(flags), 'rejected')
        self.assertEqual(count, 1)
        score.update(category=.14, alternative=.15, listing=.11)
        self.assertEqual(decision_from_flags(_visual_alignment_flags([score], 'Экскаваторы', 'media')[0]), 'manual_review')

    def test_ocr_failure_is_not_empty_text(self):
        with patch('app.classifier.subprocess.run', side_effect=OSError('missing tesseract')):
            with self.assertRaises(OSError):
                _ocr(Path('photo.png'))

    def test_animated_image_cannot_hide_unchecked_frames(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'animation.gif'
            Image.new('RGB', (12, 12), 'red').save(path, save_all=True, append_images=[Image.new('RGB', (12, 12), 'blue')], duration=100)
            with self.assertRaises(ValueError):
                _open_images([path])

    def test_download_allowlist_is_exact_and_redirects_are_not_trusted(self):
        with patch.object(settings, 'ALLOWED_HOSTS', {'bucket.storage.yandexcloud.net'}), patch('app.security._public_address', return_value=True):
            self.assertTrue(trusted_media_url('https://bucket.storage.yandexcloud.net/a.jpg'))
            for url in ['https://another.storage.yandexcloud.net/a.jpg', 'http://bucket.storage.yandexcloud.net/a.jpg', 'https://bucket.storage.yandexcloud.net:8443/a.jpg', 'https://user:pass@bucket.storage.yandexcloud.net/a.jpg', 'http://127.0.0.1/a.jpg']:
                self.assertFalse(trusted_media_url(url))

    def test_api_auth_schema_and_model_failure(self):
        from app.main import app
        with patch.object(settings, 'SHARED_SECRET', 's' * 48), patch('app.main.get_models', return_value=Mock()), TestClient(app) as client:
            body = {'title': 'Укладка асфальта', 'description': 'Подготовка основания и асфальтирование площадок', 'media': []}
            self.assertEqual(client.post('/moderate', json=body).status_code, 401)
            headers = {'Authorization': 'Bearer ' + 's' * 48}
            self.assertEqual(client.post('/moderate', json={**body, 'unknown': True}, headers=headers).status_code, 422)
            with patch('app.main.classify', side_effect=RuntimeError('model unavailable')):
                response = client.post('/moderate', json=body, headers=headers)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['decision'], 'manual_review')
                self.assertEqual(response.json()['mediaChecked'], 0)

    def test_download_failure_cannot_publish_media(self):
        from app.main import app
        import httpx
        with patch.object(settings, 'SHARED_SECRET', 's' * 48), patch('app.main.get_models', return_value=Mock()), TestClient(app) as client:
            with patch('app.main.download_media', side_effect=httpx.ConnectError('unavailable')), patch('app.main.classify', return_value=ClassificationResult()):
                response = client.post('/moderate', json={'title': 'Укладка асфальта', 'media': [{'type': 'image', 'url': 'https://strovaru.ru/a.jpg'}]}, headers={'Authorization': 'Bearer ' + 's' * 48})
                self.assertEqual(response.json()['decision'], 'manual_review')
                self.assertEqual(response.json()['mediaChecked'], 0)


if __name__ == '__main__':
    unittest.main()
