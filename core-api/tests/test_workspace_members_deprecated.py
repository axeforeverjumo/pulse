def test_workspace_direct_add_member_is_deprecated(client):
    response = client.post(
        "/api/workspaces/ws-1/members",
        json={"email": "user@example.com", "role": "member"},
    )

    assert response.status_code == 410
    assert "deprecated" in response.json()["detail"].lower()
