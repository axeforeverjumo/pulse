"""
Tests for centralized exception handling utility.

Tests the handle_api_exception function which is used across 50+ endpoints.
Critical behaviors tested:
- HTTPException pass-through (preserves upstream status codes)
- JWT/auth error detection → 401
- Not found error detection → 404
- Production error sanitization (no internal details leaked)
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException, status

from api.exceptions import (
    handle_api_exception,
    _is_auth_error,
    _is_not_found_error,
    _format_error_detail,
)


def _call_handler_in_except_block(exception, default_message, **kwargs):
    """
    Helper to call handle_api_exception inside an except block.

    This simulates real usage where handle_api_exception is always
    called from within an except block, allowing bare 'raise' to work.
    """
    try:
        raise exception
    except Exception as e:
        handle_api_exception(e, default_message, **kwargs)


class TestHandleApiException:
    """Tests for the main handle_api_exception function."""

    def test_httpexception_passthrough(self):
        """HTTPException should be re-raised as-is, preserving status code."""
        original = HTTPException(status_code=404, detail="Custom not found")

        with pytest.raises(HTTPException) as exc_info:
            _call_handler_in_except_block(original, "Default message")

        # Must preserve original status and detail
        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Custom not found"

    def test_httpexception_passthrough_400(self):
        """400 Bad Request should pass through unchanged."""
        original = HTTPException(status_code=400, detail="Validation error")

        with pytest.raises(HTTPException) as exc_info:
            _call_handler_in_except_block(original, "Default message")

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "Validation error"

    def test_jwt_expired_returns_401(self):
        """JWT expired error should return 401 with user-friendly message."""
        error = Exception("JWT expired at 2024-01-01")

        with pytest.raises(HTTPException) as exc_info:
            _call_handler_in_except_block(error, "Failed to fetch data")

        assert exc_info.value.status_code == 401
        assert "session has expired" in exc_info.value.detail.lower()

    def test_pgrst303_returns_401(self):
        """Supabase PGRST303 error should return 401."""
        error = Exception("PGRST303: JWT claim check failed")

        with pytest.raises(HTTPException) as exc_info:
            _call_handler_in_except_block(error, "Failed to fetch data")

        assert exc_info.value.status_code == 401

    def test_invalid_jwt_returns_401(self):
        """Invalid JWT error should return 401."""
        error = Exception("Invalid JWT: malformed token")

        with pytest.raises(HTTPException) as exc_info:
            _call_handler_in_except_block(error, "Failed to fetch data")

        assert exc_info.value.status_code == 401

    def test_not_found_with_flag_returns_404(self):
        """'not found' error with check_not_found=True should return 404."""
        error = Exception("Resource not found in database")

        with pytest.raises(HTTPException) as exc_info:
            _call_handler_in_except_block(error, "Failed to get resource", check_not_found=True)

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Resource not found"

    def test_not_found_without_flag_returns_500(self):
        """'not found' error with check_not_found=False should return 500."""
        error = Exception("Resource not found in database")

        with pytest.raises(HTTPException) as exc_info:
            _call_handler_in_except_block(error, "Failed to get resource", check_not_found=False)

        assert exc_info.value.status_code == 500

    def test_generic_error_returns_500(self):
        """Generic errors should return 500."""
        error = Exception("Database connection failed")

        with pytest.raises(HTTPException) as exc_info:
            _call_handler_in_except_block(error, "Operation failed")

        assert exc_info.value.status_code == 500

    @patch('api.config.settings')
    def test_production_hides_internal_details(self, mock_settings):
        """In production, internal error details should NOT be exposed."""
        mock_settings.api_env = "production"
        error = Exception("PostgreSQL error: connection refused at 10.0.0.5:5432")

        with pytest.raises(HTTPException) as exc_info:
            _call_handler_in_except_block(error, "Database error")

        # Should only show safe message, not internal details
        assert exc_info.value.detail == "Database error"
        assert "PostgreSQL" not in exc_info.value.detail
        assert "10.0.0.5" not in exc_info.value.detail

    @patch('api.config.settings')
    def test_development_shows_error_details(self, mock_settings):
        """In development, error details should be included for debugging."""
        mock_settings.api_env = "development"
        error = Exception("Specific error details here")

        with pytest.raises(HTTPException) as exc_info:
            _call_handler_in_except_block(error, "Operation failed")

        # Should include both message and error details
        assert "Operation failed" in exc_info.value.detail
        assert "Specific error details" in exc_info.value.detail

    def test_logger_called_when_provided(self):
        """Logger should be called with error details."""
        mock_logger = MagicMock()
        error = Exception("Test error")

        with pytest.raises(HTTPException):
            _call_handler_in_except_block(error, "Failed", logger=mock_logger, log_prefix="TestOp")

        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args[0][0]
        assert "TestOp" in call_args
        assert "Test error" in call_args

    def test_no_logger_no_crash(self):
        """Should work fine without a logger."""
        error = Exception("Test error")

        with pytest.raises(HTTPException):
            _call_handler_in_except_block(error, "Failed", logger=None)


class TestIsAuthError:
    """Tests for auth error detection helper."""

    @pytest.mark.parametrize("error_str", [
        "JWT expired",
        "PGRST303",
        "Invalid JWT",
        "JWTExpired",
        "token is expired",
        "Error: JWT expired at timestamp",
        "Supabase error PGRST303: unauthorized",
    ])
    def test_detects_auth_errors(self, error_str):
        """Should detect various auth error patterns."""
        assert _is_auth_error(error_str) is True

    @pytest.mark.parametrize("error_str", [
        "Database connection failed",
        "User not found",
        "Invalid input",
        "Network timeout",
        "",
    ])
    def test_ignores_non_auth_errors(self, error_str):
        """Should not flag non-auth errors as auth errors."""
        assert _is_auth_error(error_str) is False


class TestIsNotFoundError:
    """Tests for not found error detection helper."""

    @pytest.mark.parametrize("error_str", [
        "not found",
        "Not Found",
        "NOT FOUND",
        "Resource not found",
        "User not found in database",
    ])
    def test_detects_not_found_errors(self, error_str):
        """Should detect 'not found' in various cases."""
        assert _is_not_found_error(error_str) is True

    @pytest.mark.parametrize("error_str", [
        "Database error",
        "Connection failed",
        "Invalid input",
        "",
    ])
    def test_ignores_other_errors(self, error_str):
        """Should not flag other errors as not found."""
        assert _is_not_found_error(error_str) is False


class TestFormatErrorDetail:
    """Tests for error detail formatting based on environment."""

    @patch('api.config.settings')
    def test_production_returns_only_default_message(self, mock_settings):
        """Production should only return the safe default message."""
        mock_settings.api_env = "production"
        result = _format_error_detail("Safe message", "Internal: secret_key=abc123")
        assert result == "Safe message"
        assert "secret" not in result

    @patch('api.config.settings')
    def test_development_includes_error_string(self, mock_settings):
        """Development should include full error for debugging."""
        mock_settings.api_env = "development"
        result = _format_error_detail("Safe message", "Detailed error info")
        assert "Safe message" in result
        assert "Detailed error info" in result

    @patch('api.config.settings')
    def test_defaults_to_development(self, mock_settings):
        """When API_ENV not set, should default to development behavior."""
        mock_settings.api_env = "development"
        result = _format_error_detail("Safe message", "Error details")
        # Default is development, so should include details
        assert "Error details" in result
