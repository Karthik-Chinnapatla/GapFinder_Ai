from typing import List, Dict, Optional
from bson import ObjectId
from .config import get_db
from .embeddings import embed_texts, local_embed, cosine_similarity, tokenize


def _lexical_score(query: str, text: str) -> float:
    q_tokens = set(tokenize(query))
    if not q_tokens:
        return 0.0
    t_tokens = set(tokenize(text))
    if not t_tokens:
        return 0.0
    overlap = len(q_tokens & t_tokens)
    # Exact substring phrase boost
    q_lower = query.lower().strip()
    phrase_boost = 0.25 if len(q_lower) >= 4 and q_lower in text.lower() else 0.0
    return min(1.0, (overlap / len(q_tokens)) + phrase_boost)


def retrieve_chunks(
    user_id: str,
    subject_id: str,
    query: str,
    top_k: int = 5,
    chapter_id: Optional[str] = None,
    min_score: float = 0.08,
) -> List[Dict]:
    """
    Semantic + lexical hybrid retrieval from MongoDB gapfinder_db.documentchunks.
    Enforces strict userId + subjectId isolation.
    """
    db = get_db()
    filt: Dict = {
        "userId": ObjectId(user_id),
        "subjectId": ObjectId(subject_id),
    }
    if chapter_id:
        try:
            filt["chapterId"] = ObjectId(chapter_id)
        except Exception:
            pass

    cursor = db["documentchunks"].find(
        filt,
        {
            "_id": 1,
            "documentId": 1,
            "documentName": 1,
            "chapterId": 1,
            "chapterTitle": 1,
            "pageNumber": 1,
            "sectionTitle": 1,
            "content": 1,
            "embedding": 1,
            "embeddingModel": 1,
            "chunkIndex": 1,
        },
    )
    chunks = list(cursor)
    if not chunks:
        # If filtered by chapterId and none found, widen to full subject so cross-chapter materials still ground cleanly
        if chapter_id:
            filt.pop("chapterId", None)
            chunks = list(
                db["documentchunks"].find(
                    filt,
                    {
                        "_id": 1,
                        "documentId": 1,
                        "documentName": 1,
                        "chapterId": 1,
                        "chapterTitle": 1,
                        "pageNumber": 1,
                        "sectionTitle": 1,
                        "content": 1,
                        "embedding": 1,
                        "embeddingModel": 1,
                        "chunkIndex": 1,
                    },
                )
            )
    if not chunks:
        return []

    # Match query embedding dimensionality to stored chunk embeddings
    sample_model = chunks[0].get("embeddingModel", "local-hybrid-384")
    if sample_model == "local-hybrid-384":
        q_vec = local_embed(query)
    else:
        vecs, _ = embed_texts([query])
        q_vec = vecs[0] if vecs else local_embed(query)

    scored = []
    for ch in chunks:
        emb = ch.get("embedding") or []
        sem = cosine_similarity(q_vec, emb) if len(emb) == len(q_vec) else 0.0
        lex = _lexical_score(query, f"{ch.get('sectionTitle', '')} {ch.get('chapterTitle', '')} {ch.get('content', '')}")
        score = 0.65 * max(0.0, sem) + 0.35 * lex
        if score >= min_score:
            scored.append((score, ch))

    scored.sort(key=lambda x: x[0], reverse=True)
    results = []
    for score, ch in scored[:top_k]:
        content = ch.get("content", "")
        excerpt = content[:280] + ("..." if len(content) > 280 else "")
        results.append(
            {
                "chunkId": str(ch["_id"]),
                "documentId": str(ch["documentId"]),
                "documentName": ch.get("documentName") or "Uploaded Study Material",
                "chapterId": str(ch["chapterId"]) if ch.get("chapterId") else None,
                "chapterTitle": ch.get("chapterTitle") or "",
                "pageNumber": ch.get("pageNumber", None),
                "sectionTitle": ch.get("sectionTitle") or "",
                "content": content,
                "excerpt": excerpt,
                "relevanceScore": round(float(score), 4),
            }
        )
    return results
