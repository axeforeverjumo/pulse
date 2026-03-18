"""
Label normalization helper for unified email view.

The database uses a PostgreSQL generated column for normalized_labels.
This Python module provides the same logic for use in Python code (filtering, etc.)

Canonical labels: inbox, sent, draft, spam, trash, unread, starred, important, archive
"""
from typing import List

# Canonical label mapping (provider-agnostic)
# Maps ANY provider's label to canonical lowercase format
CANONICAL_MAP = {
    # Inbox
    'INBOX': 'inbox',
    'Inbox': 'inbox',

    # Sent
    'SENT': 'sent',
    'SentItems': 'sent',
    'SENTITEMS': 'sent',
    'Sent Messages': 'sent',

    # Draft
    'DRAFT': 'draft',
    'DRAFTS': 'draft',
    'Drafts': 'draft',

    # Spam
    'SPAM': 'spam',
    'JunkEmail': 'spam',
    'JUNKEMAIL': 'spam',
    'Junk': 'spam',

    # Trash
    'TRASH': 'trash',
    'DeletedItems': 'trash',
    'DELETEDITEMS': 'trash',

    # Archive
    'ARCHIVE': 'archive',
    'Archive': 'archive',

    # Status labels
    'UNREAD': 'unread',
    'STARRED': 'starred',
    'FLAGGED': 'starred',
    'IMPORTANT': 'important',

    # Gmail categories
    'CATEGORY_PERSONAL': 'personal',
    'CATEGORY_SOCIAL': 'social',
    'CATEGORY_PROMOTIONS': 'promotions',
    'CATEGORY_UPDATES': 'updates',
    'CATEGORY_FORUMS': 'forums',

    # Skip internal labels
    'CATEGORY_PRIMARY': None,
    'CHAT': None,
    'OPENED': None,
}


def normalize_labels_canonical(labels: List[str]) -> List[str]:
    """
    Normalize labels to canonical format (provider-agnostic).

    Args:
        labels: List of labels in any format (Gmail, Outlook, IMAP)

    Returns:
        List of normalized labels sorted alphabetically
    """
    if not labels:
        return []

    normalized = set()
    for label in labels:
        if not label:
            continue

        if label in CANONICAL_MAP:
            canonical = CANONICAL_MAP[label]
            if canonical:
                normalized.add(canonical)
        else:
            normalized.add(label.lower())

    return sorted(list(normalized))


def normalize_label_filter(label: str) -> str:
    """
    Normalize a single label for filtering.

    Args:
        label: A label in any format

    Returns:
        Normalized label or lowercase original
    """
    if not label:
        return ''

    if label in CANONICAL_MAP:
        canonical = CANONICAL_MAP[label]
        return canonical if canonical else label.lower()

    return label.lower()
