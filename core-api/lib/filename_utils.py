"""
Filename sanitization utility for user-provided filenames.
"""
import os
import re
import unicodedata


def sanitize_filename(filename: str) -> str:
    """Sanitize a user-provided filename to prevent path traversal and injection.

    Args:
        filename: Raw filename from user input

    Returns:
        Safe filename string, or "unnamed" if the result would be empty
    """
    # Strip path components (../../, directory separators)
    name = os.path.basename(filename)

    # Remove null bytes
    name = name.replace("\x00", "")

    # Remove control characters (chars 1-31)
    name = re.sub(r"[\x01-\x1f]", "", name)

    # Strip leading/trailing whitespace and dots
    name = name.strip().strip(".")

    # Unicode NFC normalization
    name = unicodedata.normalize("NFC", name)

    # Fallback if empty
    if not name:
        return "unnamed"

    return name
