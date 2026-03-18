"""HMAC-signed image proxy URL generator.

Generates deterministic, CDN-cacheable URLs for serving images through
a Cloudflare Worker that sits in front of the private R2 bucket.

Same inputs within the same day produce the same URL, enabling better
browser/CDN cache reuse across repeated views.
"""

import hmac
import time
from hashlib import sha256
from typing import Optional, Dict, Any
from urllib.parse import quote, urlencode

from api.config import settings

# Size variant presets
VARIANTS: Dict[str, Dict[str, Any]] = {
    "thumb":   {"w": 384,  "q": 75,  "f": "webp"},
    "chat":    {"w": 768,  "q": 82,  "f": "webp"},
    "preview": {"w": 1200, "q": 85,  "f": "webp"},
    "full":    {"w": 0,    "q": 100, "f": "auto"},
}

IMAGE_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif",
    "image/webp", "image/heic", "image/heif",
}

# URL/signature rotation window and validity.
# 7-day window: same image produces the same URL for a week,
# maximising browser cache hits and reducing Cloudflare Images
# transform quota usage (free tier = 5 000 unique transforms/month).
SIGNATURE_WINDOW_SECONDS = 7 * 86400
URL_VALIDITY_SECONDS = 14 * 86400


def is_image_type(mime_type: Optional[str]) -> bool:
    """Check if a MIME type is a resizable image.

    Args:
        mime_type: MIME type string

    Returns:
        True if the MIME type is a supported image format
    """
    if not mime_type:
        return False
    return mime_type.lower() in IMAGE_MIME_TYPES


def get_signed_url_expiration(now: Optional[int] = None) -> int:
    """Return the expiration timestamp for signed proxy URLs.

    Expiration is window-rounded for deterministic URLs and cache reuse.
    """
    ts = int(now if now is not None else time.time())
    window_start = ts // SIGNATURE_WINDOW_SECONDS * SIGNATURE_WINDOW_SECONDS
    return window_start + URL_VALIDITY_SECONDS


def generate_image_url(
    r2_key: str,
    variant: str = "thumb",
    base_url: Optional[str] = None,
    secret: Optional[str] = None,
) -> str:
    """Generate a deterministic HMAC-signed proxy URL for an image.

    Same inputs within the same day produce the same URL, enabling
    CDN cache hits. The URL is valid for 7 days.

    Args:
        r2_key: The R2 object key (e.g. "files/user123/20260204/abc.jpg")
        variant: Size variant name ("thumb", "preview", or "full")
        base_url: Override for the proxy base URL
        secret: Override for the HMAC secret

    Returns:
        Full proxy URL with HMAC signature
    """
    proxy_url = base_url or settings.image_proxy_url
    proxy_secret = secret or settings.image_proxy_secret

    if not proxy_url or not proxy_secret:
        return ""

    v = VARIANTS.get(variant, VARIANTS["thumb"])
    w = v["w"]
    q = v["q"]
    f = v["f"]

    # Round to a coarse window for deterministic URLs and better cache reuse.
    exp = get_signed_url_expiration()

    # HMAC signs the raw r2_key (not URL-encoded) so the Worker can
    # verify against the decoded path.
    message = f"{r2_key}:{w}:{q}:{f}:{exp}"
    sig = hmac.new(
        proxy_secret.encode("utf-8"),
        message.encode("utf-8"),
        sha256,
    ).hexdigest()[:32]

    # URL-encode path and query params for safety with special characters
    encoded_path = quote(r2_key, safe="/")
    query = urlencode({"w": w, "q": q, "f": f, "exp": exp, "sig": sig})
    return f"{proxy_url}/{encoded_path}?{query}"


def generate_file_url(
    r2_key: str,
    mime_type: Optional[str] = None,
    variant: str = "thumb",
) -> str:
    """Generate a proxy URL for a file. Images get resized variants; non-images get full.

    Args:
        r2_key: The R2 object key
        mime_type: File MIME type (used to determine if image resizing applies)
        variant: Size variant for images ("thumb", "preview", "full")

    Returns:
        Proxy URL string, or empty string if proxy is not configured
    """
    if not r2_key:
        return ""

    # Non-images always get the "full" variant (no resize, just CDN serving)
    if not is_image_type(mime_type):
        variant = "full"

    return generate_image_url(r2_key, variant=variant)
