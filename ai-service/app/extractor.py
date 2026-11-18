import io
import os
import re
from typing import List, Dict, Optional, Tuple
from pypdf import PdfReader
from docx import Document as DocxDocument


def _clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _detect_heading(line: str) -> Optional[str]:
    stripped = line.strip()
    if not stripped or len(stripped) > 120:
        return None
    if stripped.startswith("#"):
        return stripped.lstrip("#").strip()
    if re.match(r"^(Chapter|Unit|Module|Section|Topic)\s+\d+[\s:.-]+.+", stripped, re.IGNORECASE):
        return stripped
    if re.match(r"^\d+(\.\d+)?\s+[A-Z][A-Za-z0-9\s,&()\-/]{3,80}$", stripped):
        return stripped
    if stripped.isupper() and 4 <= len(stripped) <= 70 and not stripped.endswith("."):
        return stripped.title()
    return None


def extract_document(
    file_path: Optional[str], file_type: str, file_bytes: Optional[bytes] = None
) -> Tuple[List[Dict], Optional[int], int]:
    """
    Returns (sections, page_count, total_chars).
    Each section dict: { "text": str, "page_number": Optional[int], "section_title": str }
    Never fabricates page numbers: returns None for docx/txt.
    Supports both in-memory bytes (for serverless deployments) and local file paths.
    """
    if file_bytes is None and (not file_path or not os.path.exists(file_path)):
        raise FileNotFoundError(f"Uploaded file not found on disk: {file_path}")

    ft = file_type.lower().strip(".")
    sections: List[Dict] = []
    page_count: Optional[int] = None

    if ft == "pdf":
        reader = PdfReader(io.BytesIO(file_bytes) if file_bytes is not None else file_path)
        page_count = len(reader.pages)
        current_heading = ""
        for idx, page in enumerate(reader.pages, start=1):
            raw = page.extract_text() or ""
            cleaned = _clean_text(raw)
            if not cleaned:
                continue
            lines = cleaned.split("\n")
            for ln in lines[:4]:
                h = _detect_heading(ln)
                if h:
                    current_heading = h
                    break
            sections.append(
                {
                    "text": cleaned,
                    "page_number": idx,
                    "section_title": current_heading or f"Page {idx}",
                }
            )

    elif ft == "docx":
        doc = DocxDocument(io.BytesIO(file_bytes) if file_bytes is not None else file_path)
        current_heading = "Introduction"
        buffer: List[str] = []
        for para in doc.paragraphs:
            txt = para.text.strip()
            if not txt:
                continue
            style_name = (para.style.name or "").lower() if para.style else ""
            heading = txt if "heading" in style_name else _detect_heading(txt)
            if heading:
                if buffer:
                    sections.append(
                        {
                            "text": _clean_text("\n".join(buffer)),
                            "page_number": None,
                            "section_title": current_heading,
                        }
                    )
                    buffer = []
                current_heading = heading
            else:
                buffer.append(txt)
        if buffer:
            sections.append(
                {
                    "text": _clean_text("\n".join(buffer)),
                    "page_number": None,
                    "section_title": current_heading,
                }
            )
        # Also extract table text if present
        for t_idx, table in enumerate(doc.tables, start=1):
            rows = []
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    rows.append(" | ".join(cells))
            if rows:
                sections.append(
                    {
                        "text": _clean_text("\n".join(rows)),
                        "page_number": None,
                        "section_title": f"Table {t_idx}",
                    }
                )

    elif ft == "txt":
        if file_bytes is not None:
            raw = file_bytes.decode("utf-8", errors="ignore")
        else:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                raw = f.read()
        cleaned = _clean_text(raw)
        current_heading = "Overview"
        buffer: List[str] = []
        for line in cleaned.split("\n"):
            heading = _detect_heading(line)
            if heading:
                if buffer:
                    sections.append(
                        {
                            "text": _clean_text("\n".join(buffer)),
                            "page_number": None,
                            "section_title": current_heading,
                        }
                    )
                    buffer = []
                current_heading = heading
            else:
                buffer.append(line)
        if buffer:
            sections.append(
                {
                    "text": _clean_text("\n".join(buffer)),
                    "page_number": None,
                    "section_title": current_heading,
                }
            )
    else:
        raise ValueError(f"Unsupported file type: {file_type}")

    total_chars = sum(len(s["text"]) for s in sections)
    return sections, page_count, total_chars
