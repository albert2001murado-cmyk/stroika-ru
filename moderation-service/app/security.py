import ipaddress
import socket
from pathlib import Path
from urllib.parse import urlparse

import httpx

from . import settings


class MediaDownloadError(RuntimeError):
    pass


def _public_address(host: str) -> bool:
    try:
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False
    if not addresses:
        return False
    for entry in addresses:
        try:
            address = ipaddress.ip_address(entry[4][0])
        except ValueError:
            return False
        if not address.is_global:
            return False
    return True


def trusted_media_url(value: str) -> bool:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host or parsed.username or parsed.password:
        return False
    try:
        if parsed.port not in (None, 443):
            return False
    except ValueError:
        return False
    return host in settings.ALLOWED_HOSTS and _public_address(host)


async def download_media(url: str, media_type: str, target: Path) -> Path:
    if not trusted_media_url(url):
        raise MediaDownloadError("untrusted-media-url")
    maximum = (
        settings.MAX_IMAGE_BYTES if media_type == "image" else settings.MAX_VIDEO_BYTES
    )
    expected_prefix = "image/" if media_type == "image" else "video/"
    timeout = httpx.Timeout(
        settings.DOWNLOAD_TIMEOUT_SECONDS,
        connect=min(15.0, settings.DOWNLOAD_TIMEOUT_SECONDS),
    )
    total = 0
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        async with client.stream(
            "GET",
            url,
            headers={"User-Agent": "StroikaLocalModeration/1.0"},
        ) as response:
            if response.status_code != 200:
                raise MediaDownloadError(f"media-http-{response.status_code}")
            content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
            if content_type and not content_type.startswith(expected_prefix):
                raise MediaDownloadError("unexpected-media-type")
            content_length = response.headers.get("content-length", "")
            if content_length.isdigit() and int(content_length) > maximum:
                raise MediaDownloadError("media-too-large")
            with target.open("wb") as output:
                async for chunk in response.aiter_bytes(256 * 1024):
                    total += len(chunk)
                    if total > maximum:
                        raise MediaDownloadError("media-too-large")
                    output.write(chunk)
    if total == 0:
        raise MediaDownloadError("empty-media")
    return target

