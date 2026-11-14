import asyncio
import hmac
import logging
import tempfile
import traceback
import httpx
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException

from . import settings
from .classifier import DownloadedMedia, classify, get_models
from .policy import decision_from_flags
from .schemas import ModerationFlag, ModerationRequest, ModerationResponse
from .security import MediaDownloadError, download_media


moderation_lock = asyncio.Semaphore(1)
logger = logging.getLogger("stroika.moderation")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if len(settings.SHARED_SECRET) < 32 or not settings.ALLOWED_HOSTS:
        raise RuntimeError("Configure a strong shared secret and exact media hosts before startup")
    if not settings.OCR_ENABLED or not settings.VIDEO_AUDIO_ENABLED:
        raise RuntimeError("OCR and video audio checks must be enabled")
    from pillow_heif import register_heif_opener
    register_heif_opener()
    # Download and load ALL required models before reporting ready, including speech.
    models = await asyncio.to_thread(get_models)
    await asyncio.to_thread(models.whisper_model)
    yield


app = FastAPI(
    title="Стройка.ру — локальная модерация",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


def authorize(authorization: str = Header(default="")) -> None:
    if not settings.SHARED_SECRET:
        raise HTTPException(status_code=503, detail="shared secret is not configured")
    supplied = authorization[7:].strip() if authorization.startswith("Bearer ") else ""
    if not supplied or not hmac.compare_digest(supplied, settings.SHARED_SECRET):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
async def health() -> dict[str, str | int | bool]:
    return {"status": "ok", "service": "stroika-local-moderation-v1",
            "protocolVersion": 2, "policyVersion": "2026-11-14.1", "supportsCatalogAlternatives": True,
            "busy": moderation_lock.locked()}


@app.post("/moderate", response_model=ModerationResponse)
async def moderate(
    request: ModerationRequest,
    _: None = Depends(authorize),
) -> ModerationResponse:
    # Do not queue requests that may outlive the website's deadline. The website retries with backoff.
    if moderation_lock.locked():
        raise HTTPException(status_code=503, detail="moderation is busy", headers={"Retry-After": "60"})
    async with moderation_lock:
        with tempfile.TemporaryDirectory(prefix="stroika-moderation-") as temporary:
            work_dir = Path(temporary)
            downloaded: list[DownloadedMedia] = []
            flags: list[ModerationFlag] = []
            download_deadline = asyncio.get_running_loop().time() + 45
            for index, item in enumerate(request.media):
                extension = ".jpg" if item.type == "image" else ".mp4"
                target = work_dir / f"media-{index}{extension}"
                try:
                    # One overall download budget, not one unlimited budget per attachment.
                    remaining = download_deadline - asyncio.get_running_loop().time()
                    if remaining <= 0:
                        raise MediaDownloadError("download-budget-exhausted")
                    async with asyncio.timeout(remaining):
                        await download_media(str(item.url), item.type, target)
                    downloaded.append(DownloadedMedia(type=item.type, path=target))
                except (MediaDownloadError, httpx.HTTPError, TimeoutError, OSError):
                    flags.append(
                        ModerationFlag(
                            code="media-download-failed",
                            field="media",
                            severity="review",
                            message=(
                                "Не удалось безопасно загрузить одно из вложений для проверки."
                            ),
                        )
                    )

            try:
                result = await asyncio.to_thread(
                    classify,
                    request,
                    downloaded,
                    work_dir,
                )
                flags.extend(result.flags)
                return ModerationResponse(
                    decision=decision_from_flags(flags),
                    flags=flags,
                    mediaChecked=result.media_checked,
                    scores=result.scores,
                )
            except Exception as error:
                # Logs include the failing operation, without publication text or secrets.
                logger.error("Local moderation model failed (%s)\n%s", type(error).__name__,
                             "".join(traceback.format_tb(error.__traceback__)))
                flags.append(
                    ModerationFlag(
                        code="local-model-error",
                        field="content",
                        severity="review",
                        message=(
                            "Локальная модель временно не завершила проверку; "
                            "публикация передана модератору."
                        ),
                    )
                )
                return ModerationResponse(
                    decision="manual_review",
                    flags=flags,
                    mediaChecked=0,
                    scores={"modelError": True},
                )

