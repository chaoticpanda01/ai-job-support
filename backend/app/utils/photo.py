"""
Rirekisho photo normalisation.

The photo is embedded in the 履歴書 PDF as a ~30x40 mm picture, but WeasyPrint
decodes it at full size: a 445 KB single-colour 12000x12000 PNG pushed PDF
generation to ~1.2 GB, enough to take the API process down. The upload check
(libmagic type + 5 MB) says nothing about pixel dimensions, so the limit is
enforced here, and what gets stored is a downscaled re-encode.
"""

from __future__ import annotations

import io

from PIL import Image, ImageOps

# Refused from the header, before any pixel is decoded. A JPEG is shrunk while
# it is read (draft below): ~40 MB extra at 49 MP for a baseline file, ~190 MB
# for a progressive one, whose coefficients libjpeg buffers whole. A PNG has
# to be decoded whole, at ~9-12 MB per megapixel, so it gets a much lower limit.
MAX_PIXELS = {"JPEG": 50_000_000, "PNG": 12_000_000}
# Plenty for a 30x40 mm print at 600 dpi.
PHOTO_MAX_SIDE = (1200, 1600)

_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png"}


class InvalidPhotoError(ValueError):
    """The upload is not a usable JPEG/PNG photo."""


def normalise_photo(file_bytes: bytes) -> tuple[bytes, str]:
    """
    Validate a photo and return (bytes, mime_type) of a downscaled re-encode.

    Dimensions are read from the header first, so an oversized image is
    refused before any pixel is decoded. Re-encoding applies the EXIF
    rotation (which re-saving drops) and strips metadata such as GPS.
    """
    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            # Cameras that embed an MPF segment (multi-picture: Samsung, Sony,
            # portrait and gain-map shots) make Pillow report a JPEG as MPO.
            # libmagic still calls it image/jpeg, so it passed the route's check.
            fmt = "JPEG" if img.format == "MPO" else (img.format or "")
            if fmt not in _FORMATS:
                raise InvalidPhotoError("Only JPEG and PNG images are accepted")
            limit = MAX_PIXELS[fmt]
            if img.width * img.height > limit:
                raise InvalidPhotoError(
                    f"Image is too large; use a {fmt} under {limit // 1_000_000} megapixels"
                )
            if fmt == "JPEG":
                # Lets the decoder shrink while reading, instead of
                # materialising the full-size bitmap first.
                img.draft("RGB", PHOTO_MAX_SIDE)
            img.load()
            out = ImageOps.exif_transpose(img)
            out.thumbnail(PHOTO_MAX_SIDE)
            if fmt == "JPEG" and out.mode != "RGB":
                out = out.convert("RGB")
            buf = io.BytesIO()
            out.save(buf, format=fmt)
    except InvalidPhotoError:
        raise
    except Image.DecompressionBombError as exc:
        # Raised by Image.open itself for anything far past Pillow's own limit,
        # before the explicit size check above can run.
        raise InvalidPhotoError("Image is too large; use a smaller photo") from exc
    except (OSError, ValueError) as exc:
        # UnidentifiedImageError is an OSError; truncated files are OSError too.
        raise InvalidPhotoError("The file is not a valid image") from exc
    return buf.getvalue(), _FORMATS[fmt]
