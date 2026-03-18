"""Permissions service package."""
from api.services.permissions.share import share_resource, batch_share_resource, revoke_share, update_share
from api.services.permissions.fetch import get_resource_shares, get_shared_with_me
from api.services.permissions.links import (
    create_share_link,
    revoke_share_link,
    get_resource_links,
    resolve_share_link,
    update_share_link_slug,
    check_share_link_slug_availability,
)
from api.services.permissions.access_requests import (
    create_access_request,
    resolve_access_request,
    list_pending_access_requests,
)

__all__ = [
    "share_resource",
    "batch_share_resource",
    "revoke_share",
    "update_share",
    "get_resource_shares",
    "get_shared_with_me",
    "create_share_link",
    "revoke_share_link",
    "get_resource_links",
    "resolve_share_link",
    "update_share_link_slug",
    "check_share_link_slug_availability",
    "create_access_request",
    "resolve_access_request",
    "list_pending_access_requests",
]
