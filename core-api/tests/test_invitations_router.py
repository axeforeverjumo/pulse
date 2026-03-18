from unittest.mock import AsyncMock


def test_get_share_link_route_wiring(client, monkeypatch):
    from api.routers import invitations as invitations_router

    service_mock = AsyncMock(
        return_value={
            "invitation_id": "inv-1",
            "invite_url": "https://app.example.com/invite/token-abc",
            "expires_at": "2026-03-01T00:00:00Z",
        }
    )
    monkeypatch.setattr(invitations_router, "get_workspace_invitation_share_link", service_mock)

    response = client.get("/api/workspaces/invitations/inv-1/share-link")

    assert response.status_code == 200
    payload = response.json()
    assert payload["invitation_id"] == "inv-1"
    assert payload["invite_url"].endswith("/invite/token-abc")
