"""
Smart Search Service Package

Provides intelligent search across user data using:
1. Provider search (Gmail/Outlook API) - preferred when OAuth is active
2. Local hybrid search (full-text + semantic re-ranking) - fallback
"""

from api.services.smart_search.provider_search import ProviderSearchService
from api.services.smart_search.reranker import SemanticReranker

__all__ = ['ProviderSearchService', 'SemanticReranker']
