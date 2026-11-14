import unittest

from app.policy import decision_from_flags, text_quality_flags
from app.schemas import ModerationFlag


class PolicyTests(unittest.TestCase):
    def test_generic_title_is_returned_for_changes(self) -> None:
        flags = text_quality_flags(
            "Лучшие",
            "Сдаём автобетононасос в аренду по Нижнему Новгороду и области.",
        )
        self.assertEqual(decision_from_flags(flags), "rejected")
        self.assertIn("generic-title", {flag.code for flag in flags})

    def test_specific_listing_passes_quality_layer(self) -> None:
        flags = text_quality_flags(
            "Аренда автобетононасоса",
            "Подача бетона на строительные объекты по Нижнему Новгороду и области.",
        )
        self.assertEqual(flags, [])

    def test_review_does_not_auto_approve(self) -> None:
        flags = [
            ModerationFlag(
                code="uncertain",
                field="media",
                severity="review",
                message="Нужна проверка.",
            )
        ]
        self.assertEqual(decision_from_flags(flags), "manual_review")


if __name__ == "__main__":
    unittest.main()

