"""
OpenAPI schema validation tests.

These tests ensure the OpenAPI spec is complete and well-typed:
1. Valid OpenAPI 3.x JSON
2. Every endpoint has a typed response schema (not bare "Successful Response")
3. No raw `dict` parameter types in the schema
"""
import json
import pytest
from fastapi.testclient import TestClient
from index import app


client = TestClient(app)


@pytest.fixture(scope="module")
def openapi_spec() -> dict:
    """Get the OpenAPI spec once for all tests."""
    response = client.get("/openapi.json")
    assert response.status_code == 200, "Failed to fetch /openapi.json"
    spec = response.json()
    return spec


def test_openapi_is_valid_3x(openapi_spec: dict) -> None:
    """OpenAPI JSON must be valid 3.x."""
    assert "openapi" in openapi_spec, "Missing 'openapi' version key"
    version = openapi_spec["openapi"]
    assert version.startswith("3."), f"Expected OpenAPI 3.x, got {version}"
    assert "info" in openapi_spec, "Missing 'info' key"
    assert "paths" in openapi_spec, "Missing 'paths' key"
    assert len(openapi_spec["paths"]) > 0, "No paths defined in spec"


def test_every_endpoint_has_response_schema(openapi_spec: dict) -> None:
    """Every endpoint must have a response schema — not bare 'Successful Response'."""
    paths = openapi_spec.get("paths", {})
    failures = []

    # Endpoints that return 204 No Content have no response body by design
    skip_status_codes = {"204"}

    for path, methods in paths.items():
        for method, operation in methods.items():
            if method in ("parameters", "servers", "summary", "description"):
                continue

            responses = operation.get("responses", {})
            if not responses:
                failures.append(f"{method.upper()} {path}: No responses defined")
                continue

            # Find the success response (2xx)
            success_codes = [c for c in responses if c.startswith("2")]
            if not success_codes:
                continue

            for code in success_codes:
                if code in skip_status_codes:
                    continue

                resp = responses[code]
                description = resp.get("description", "")

                # Check if response has content with a schema
                content = resp.get("content", {})
                if not content:
                    # "Successful Response" with no content means no response_model
                    if description == "Successful Response":
                        failures.append(
                            f"{method.upper()} {path} [{code}]: "
                            f"Bare 'Successful Response' — add response_model="
                        )
                    continue

                # Verify the content has a schema ref or inline schema
                # Skip streaming endpoints that define custom media types
                has_custom_media = any(
                    mt not in ("application/json",)
                    for mt in content
                )
                for media_type, media_obj in content.items():
                    # Skip non-JSON media types (streaming, plain text, etc.)
                    if media_type != "application/json":
                        continue
                    # Skip JSON fallback when custom media types are present
                    if has_custom_media:
                        continue
                    schema = media_obj.get("schema", {})
                    if not schema:
                        failures.append(
                            f"{method.upper()} {path} [{code}] {media_type}: "
                            f"Empty schema"
                        )

    if failures:
        msg = "Endpoints missing response schemas:\n" + "\n".join(f"  - {f}" for f in failures)
        pytest.fail(msg)


def test_no_raw_dict_params(openapi_spec: dict) -> None:
    """No raw `dict` types should appear as request body parameters."""
    paths = openapi_spec.get("paths", {})
    failures = []

    for path, methods in paths.items():
        for method, operation in methods.items():
            if method in ("parameters", "servers", "summary", "description"):
                continue

            request_body = operation.get("requestBody", {})
            if not request_body:
                continue

            content = request_body.get("content", {})
            for media_type, media_obj in content.items():
                schema = media_obj.get("schema", {})
                _check_schema_for_raw_dict(
                    schema, f"{method.upper()} {path}", failures, openapi_spec
                )

    if failures:
        msg = "Endpoints with raw dict parameters:\n" + "\n".join(f"  - {f}" for f in failures)
        pytest.fail(msg)


def _check_schema_for_raw_dict(
    schema: dict,
    context: str,
    failures: list,
    spec: dict,
    depth: int = 0,
) -> None:
    """Recursively check for raw dict (object with no properties)."""
    if depth > 10:
        return

    # Resolve $ref
    if "$ref" in schema:
        ref_path = schema["$ref"].lstrip("#/").split("/")
        resolved = spec
        for part in ref_path:
            resolved = resolved.get(part, {})
        schema = resolved

    schema_type = schema.get("type")

    # A bare "object" with no properties = raw dict
    # Allow nested Dict[str, Any] fields (they generate {"type": "object"} which is intentional)
    if schema_type == "object" and not schema.get("properties") and not schema.get("allOf"):
        # Skip if this is a nested field (depth > 0) — Dict[str, Any] is fine for dynamic data
        if depth == 0 and not schema.get("additionalProperties"):
            failures.append(f"{context}: raw dict parameter (object with no properties)")
        return

    # Check nested properties
    for prop_name, prop_schema in schema.get("properties", {}).items():
        _check_schema_for_raw_dict(
            prop_schema,
            f"{context}.{prop_name}",
            failures,
            spec,
            depth + 1,
        )
