"""
Semantic Reranker Service

On-demand embedding for re-ranking search results.
Only used when provider search isn't available (fallback for local search).
No pre-computed embeddings stored - we embed at query time.

Cost: ~$0.00002 per search (embedding 50 candidates ≈ 25K tokens)
"""

from typing import List, Dict, Any
from openai import AsyncOpenAI
import numpy as np
import logging

from api.config import settings

logger = logging.getLogger(__name__)


class SemanticReranker:
    """
    Re-rank search results using semantic similarity.

    How it works:
    1. Take candidate results from full-text search
    2. Embed the query
    3. Embed all candidate texts (in one batch API call)
    4. Compute cosine similarity
    5. Return top_k sorted by similarity

    This is only used as a fallback when provider search isn't available.
    """

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = "text-embedding-3-small"
        self.dimensions = 1536

    async def rerank(
        self,
        query: str,
        candidates: List[Dict[str, Any]],
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Re-rank candidates by semantic similarity to query.

        Args:
            query: The search query
            candidates: List of candidate results from full-text search
            top_k: Number of top results to return

        Returns:
            List of candidates sorted by similarity score (highest first)
        """
        if not candidates:
            return []

        if len(candidates) == 1:
            # No need to re-rank single result
            candidates[0]['similarity'] = 1.0
            return candidates

        try:
            # Prepare texts for embedding
            candidate_texts = [self._prepare_text(c) for c in candidates]
            texts = [query] + candidate_texts

            logger.info(f"🔄 Re-ranking {len(candidates)} candidates with semantic similarity")

            # Batch embed (query + all candidates in one API call)
            response = await self.client.embeddings.create(
                model=self.model,
                input=texts
            )

            embeddings = [e.embedding for e in response.data]
            query_embedding = np.array(embeddings[0])
            candidate_embeddings = np.array(embeddings[1:])

            # Compute cosine similarity
            similarities = self._cosine_similarity(query_embedding, candidate_embeddings)

            # Sort by similarity (descending) and take top_k
            ranked_indices = np.argsort(similarities)[::-1][:top_k]

            results = []
            for idx in ranked_indices:
                candidate = candidates[idx].copy()
                candidate['similarity'] = float(similarities[idx])
                results.append(candidate)

            logger.info(f"✅ Re-ranked to {len(results)} results (top similarity: {results[0]['similarity']:.3f})")
            return results

        except Exception as e:
            logger.error(f"❌ Re-ranking failed: {e}")
            # Return original order if re-ranking fails
            for c in candidates[:top_k]:
                c['similarity'] = 0.0
            return candidates[:top_k]

    def _cosine_similarity(
        self,
        query_embedding: np.ndarray,
        candidate_embeddings: np.ndarray
    ) -> np.ndarray:
        """
        Compute cosine similarity between query and all candidates.

        Args:
            query_embedding: 1D array of shape (dim,)
            candidate_embeddings: 2D array of shape (n_candidates, dim)

        Returns:
            1D array of similarities of shape (n_candidates,)
        """
        # Normalize vectors
        query_norm = np.linalg.norm(query_embedding)
        candidate_norms = np.linalg.norm(candidate_embeddings, axis=1)

        # Avoid division by zero
        query_norm = max(query_norm, 1e-8)
        candidate_norms = np.maximum(candidate_norms, 1e-8)

        # Compute cosine similarity
        dot_products = np.dot(candidate_embeddings, query_embedding)
        similarities = dot_products / (candidate_norms * query_norm)

        return similarities

    def _prepare_text(self, item: Dict[str, Any]) -> str:
        """
        Prepare text for embedding based on item type.

        Combines relevant fields for better semantic matching.
        """
        item_type = item.get('type', '')

        if item_type == 'email':
            parts = []
            if item.get('title'):  # subject
                parts.append(f"Subject: {item['title']}")
            if item.get('metadata', {}).get('from'):
                parts.append(f"From: {item['metadata']['from']}")
            if item.get('content'):  # snippet
                parts.append(item['content'])
            return '\n'.join(parts) if parts else str(item)

        elif item_type == 'calendar':
            parts = []
            if item.get('title'):
                parts.append(item['title'])
            if item.get('content'):  # description
                parts.append(item['content'])
            if item.get('metadata', {}).get('location'):
                parts.append(f"Location: {item['metadata']['location']}")
            return '\n'.join(parts) if parts else str(item)

        elif item_type == 'document':
            parts = []
            if item.get('title'):
                parts.append(item['title'])
            if item.get('content'):
                # Truncate long documents
                content = item['content'][:1500]
                parts.append(content)
            return '\n'.join(parts) if parts else str(item)

        else:
            # Generic handling - combine all string values
            text_parts = []
            for key, value in item.items():
                if isinstance(value, str) and value and key not in ('id', 'type'):
                    text_parts.append(value)
            return '\n'.join(text_parts[:3]) if text_parts else str(item)


async def full_text_search_rpc(
    user_id: str,
    user_jwt: str,
    query: str,
    search_types: List[str] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Call the full_text_search RPC function in Supabase.

    This is used for local fallback search when provider search isn't available.

    Args:
        user_id: User's ID
        user_jwt: User's JWT for auth
        query: Search query
        search_types: Types to search (emails, calendar, todos, documents)
        limit: Maximum results

    Returns:
        List of search results from the RPC function
    """
    from lib.supabase_client import get_authenticated_async_client

    if search_types is None:
        search_types = ['emails', 'calendar', 'documents']

    try:
        auth_supabase = await get_authenticated_async_client(user_jwt)

        result = await auth_supabase.rpc(
            'full_text_search',
            {
                'search_query': query,
                'search_types': search_types,
                'result_limit': limit,
                'p_user_id': user_id
            }
        ).execute()

        return result.data or []

    except Exception as e:
        logger.error(f"❌ Full-text search RPC failed: {e}")
        return []
