import re
from typing import List, Dict


def _split_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9(\[])|\n+", text)
    return [p.strip() for p in parts if p.strip()]


def chunk_sections(
    sections: List[Dict],
    target_chars: int = 580,
    overlap_chars: int = 110,
) -> List[Dict]:
    """
    Divides extracted document sections into meaningful overlapping chunks,
    preserving page_number (or None) and section_title without fabrication.
    """
    chunks: List[Dict] = []
    chunk_index = 0

    for sec in sections:
        text = sec.get("text", "").strip()
        if not text:
            continue
        page_number = sec.get("page_number", None)
        section_title = sec.get("section_title", "")

        sentences = _split_sentences(text)
        current: List[str] = []
        current_len = 0

        for sent in sentences:
            if len(sent) > target_chars * 1.6:
                # Hard-wrap unusually long single paragraph
                words = sent.split()
                sub = []
                sub_len = 0
                for w in words:
                    if sub_len + len(w) + 1 > target_chars and sub:
                        chunk_text = " ".join(sub).strip()
                        chunks.append(
                            {
                                "chunk_index": chunk_index,
                                "page_number": page_number,
                                "section_title": section_title,
                                "content": chunk_text,
                                "token_count": len(chunk_text.split()),
                            }
                        )
                        chunk_index += 1
                        sub = sub[-18:]
                        sub_len = sum(len(x) + 1 for x in sub)
                    sub.append(w)
                    sub_len += len(w) + 1
                if sub:
                    current.append(" ".join(sub))
                    current_len += len(current[-1])
                continue

            if current_len + len(sent) + 1 > target_chars and current:
                chunk_text = " ".join(current).strip()
                chunks.append(
                    {
                        "chunk_index": chunk_index,
                        "page_number": page_number,
                        "section_title": section_title,
                        "content": chunk_text,
                        "token_count": len(chunk_text.split()),
                    }
                )
                chunk_index += 1

                # Keep trailing overlap sentences
                overlap: List[str] = []
                olen = 0
                for prev in reversed(current):
                    if olen + len(prev) > overlap_chars and overlap:
                        break
                    overlap.insert(0, prev)
                    olen += len(prev) + 1
                current = overlap
                current_len = olen

            current.append(sent)
            current_len += len(sent) + 1

        if current:
            chunk_text = " ".join(current).strip()
            if len(chunk_text) >= 25 or not chunks:
                chunks.append(
                    {
                        "chunk_index": chunk_index,
                        "page_number": page_number,
                        "section_title": section_title,
                        "content": chunk_text,
                        "token_count": len(chunk_text.split()),
                    }
                )
                chunk_index += 1

    return chunks
