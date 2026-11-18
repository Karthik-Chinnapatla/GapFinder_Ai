import hashlib
import math
import re
from typing import List, Tuple
import httpx
import numpy as np
from .config import GEMINI_API_KEY, OPENAI_API_KEY

DIM = 384

STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "as", "into",
    "that", "this", "these", "those", "it", "its", "or", "and", "but", "if",
    "then", "than", "so", "such", "not", "no", "can", "will", "just", "should",
    "would", "could", "have", "has", "had", "do", "does", "did", "which", "who",
    "what", "when", "where", "why", "how", "all", "each", "every", "both", "more",
    "most", "other", "some", "any", "only", "own", "same", "too", "very", "also",
}

# Domain-agnostic + CS/STEM synonym folding for higher semantic recall in local mode
SYNONYM_GROUPS = [
    {"array", "arrays", "contiguous", "index", "indexed", "randomaccess"},
    {"linked", "linkedlist", "node", "nodes", "pointer", "pointers", "next", "prev", "head", "tail"},
    {"stack", "stacks", "lifo", "push", "pop", "peek", "callstack"},
    {"queue", "queues", "fifo", "enqueue", "dequeue", "circular", "deque"},
    {"tree", "trees", "binary", "bst", "root", "leaf", "subtree", "parent", "child", "height", "depth"},
    {"traversal", "inorder", "preorder", "postorder", "levelorder", "bfs", "dfs"},
    {"avl", "redblack", "balanced", "rotation", "balancefactor", "skewed"},
    {"graph", "graphs", "vertex", "vertices", "edge", "edges", "adjacency", "directed", "undirected", "weighted", "cycle"},
    {"dijkstra", "shortest", "spanning", "mst", "kruskal", "prim", "topological"},
    {"sort", "sorting", "quicksort", "mergesort", "heapsort", "bubblesort", "insertion", "selection", "divide", "conquer", "pivot", "stable"},
    {"heap", "heaps", "priority", "minheap", "maxheap", "heapify"},
    {"hash", "hashing", "hashtable", "collision", "chaining", "probing", "loadfactor"},
    {"complexity", "time", "space", "bigo", "asymptotic", "worst", "average", "best", "logarithmic", "linear", "quadratic"},
    {"recursion", "recursive", "basecase", "memoization", "dynamic"},
]

SYNONYM_MAP = {}
for idx, grp in enumerate(SYNONYM_GROUPS):
    tag = f"__concept_{idx}__"
    for term in grp:
        SYNONYM_MAP[term] = tag


def tokenize(text: str) -> List[str]:
    raw = re.findall(r"[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?", text.lower())
    tokens = []
    for t in raw:
        t = t.replace("-", "")
        if len(t) <= 1 or t in STOPWORDS:
            continue
        # Light suffix normalization
        if len(t) > 5 and t.endswith("ing"):
            t = t[:-3]
        elif len(t) > 4 and t.endswith("ies"):
            t = t[:-3] + "y"
        elif len(t) > 4 and t.endswith("ed"):
            t = t[:-2]
        elif len(t) > 4 and t.endswith("s") and not t.endswith("ss"):
            t = t[:-1]
        tokens.append(t)
    return tokens


def _hash_feature(feat: str) -> Tuple[int, float]:
    digest = hashlib.blake2b(feat.encode("utf-8"), digest_size=8).digest()
    val = int.from_bytes(digest[:4], "little")
    sign = 1.0 if (digest[4] & 1) == 0 else -1.0
    return val % DIM, sign


def local_embed(text: str) -> List[float]:
    vec = np.zeros(DIM, dtype=np.float32)
    tokens = tokenize(text)
    if not tokens:
        return vec.tolist()

    # Term frequency weighting with log damping
    counts = {}
    for t in tokens:
        counts[t] = counts.get(t, 0) + 1

    for tok, cnt in counts.items():
        w = 1.0 + math.log(1.0 + cnt)
        idx, sign = _hash_feature(f"u:{tok}")
        vec[idx] += sign * w * 1.4

        # Concept-cluster boost
        if tok in SYNONYM_MAP:
            c_idx, c_sign = _hash_feature(f"c:{SYNONYM_MAP[tok]}")
            vec[c_idx] += c_sign * w * 0.9

        # Character 4-grams for morphological / spelling robustness
        if len(tok) >= 4:
            padded = f"<{tok}>"
            for i in range(len(padded) - 3):
                g_idx, g_sign = _hash_feature(f"g:{padded[i:i+4]}")
                vec[g_idx] += g_sign * 0.35

    # Bigrams for phrase semantics (e.g. "binary search", "linked list")
    for i in range(len(tokens) - 1):
        b_idx, b_sign = _hash_feature(f"b:{tokens[i]}_{tokens[i+1]}")
        vec[b_idx] += b_sign * 1.1

    norm = float(np.linalg.norm(vec))
    if norm > 1e-8:
        vec /= norm
    return [round(float(x), 6) for x in vec]


def embed_texts(texts: List[str]) -> Tuple[List[List[float]], str]:
    """
    Generates dense vector embeddings.
    Uses Gemini or OpenAI embeddings when API key is configured;
    falls back cleanly to local-hybrid-384 dense vectors.
    """
    if not texts:
        return [], "local-hybrid-384"

    if GEMINI_API_KEY:
        try:
            vectors = []
            url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={GEMINI_API_KEY}"
            with httpx.Client(timeout=20.0) as client:
                for t in texts:
                    resp = client.post(
                        url,
                        json={"model": "models/text-embedding-004", "content": {"parts": [{"text": t[:4000]}]}},
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    vectors.append(data["embedding"]["values"])
            return vectors, "gemini-text-embedding-004"
        except Exception as e:
            print(f"[Embeddings] Gemini embedding failed, falling back to local: {e}")

    if OPENAI_API_KEY:
        try:
            with httpx.Client(timeout=25.0) as client:
                resp = client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    json={"model": "text-embedding-3-small", "input": [t[:4000] for t in texts]},
                )
                resp.raise_for_status()
                data = resp.json()
                vectors = [item["embedding"] for item in data["data"]]
            return vectors, "openai-text-embedding-3-small"
        except Exception as e:
            print(f"[Embeddings] OpenAI embedding failed, falling back to local: {e}")

    return [local_embed(t) for t in texts], "local-hybrid-384"


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    na = float(np.linalg.norm(va))
    nb = float(np.linalg.norm(vb))
    if na < 1e-8 or nb < 1e-8:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))
