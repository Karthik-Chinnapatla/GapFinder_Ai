import base64
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from bson import ObjectId
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import get_db, get_llm_mode
from .extractor import extract_document
from .chunker import chunk_sections
from .embeddings import embed_texts
from .retriever import retrieve_chunks
from .llm_provider import (
    generate_grounded_questions,
    evaluate_student_answer,
    generate_rag_chat_reply,
)

app = FastAPI(title="GapFinder AI — RAG & Diagnostic AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class IndexDocumentRequest(BaseModel):
    documentId: str
    userId: str
    subjectId: str
    chapterId: Optional[str] = None
    chapterTitle: Optional[str] = ""
    documentName: str
    filePath: Optional[str] = None
    fileContentBase64: Optional[str] = None
    fileType: str
    isDemo: bool = False


class SearchRequest(BaseModel):
    userId: str
    subjectId: str
    query: str
    topK: int = 5
    chapterId: Optional[str] = None


class TopicInput(BaseModel):
    topicId: str
    topicName: str
    chapterId: Optional[str] = None
    chapterTitle: Optional[str] = ""
    description: Optional[str] = ""
    masteryScore: Optional[float] = None


class GenerateQuestionsRequest(BaseModel):
    userId: str
    subjectId: str
    topics: List[TopicInput]
    questionCount: int = 5
    difficulty: str = "medium"
    questionTypes: List[str] = ["mcq", "true_false", "short_answer", "conceptual"]


class EvaluateAnswerRequest(BaseModel):
    question: Dict[str, Any]
    selectedAnswer: str


class ChatRequest(BaseModel):
    userId: str
    subjectId: str
    subjectName: str
    message: str
    weakTopics: List[str] = []
    history: List[Dict[str, str]] = []


@app.get("/health")
def health():
    db_ok = False
    try:
        db = get_db()
        db.command("ping")
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "gapfinder_db",
        "dbConnected": db_ok,
        "aiMode": get_llm_mode(),
    }


@app.post("/rag/index-document")
def index_document(req: IndexDocumentRequest):
    db = get_db()
    doc_oid = ObjectId(req.documentId)
    user_oid = ObjectId(req.userId)
    subj_oid = ObjectId(req.subjectId)
    chap_oid = ObjectId(req.chapterId) if req.chapterId else None

    try:
        db["documents"].update_one(
            {"_id": doc_oid, "userId": user_oid},
            {"$set": {"processingStatus": "processing", "errorMessage": ""}},
        )

        file_bytes = base64.b64decode(req.fileContentBase64) if req.fileContentBase64 else None
        sections, page_count, total_chars = extract_document(req.filePath, req.fileType, file_bytes=file_bytes)
        if not sections or total_chars < 15:
            raise ValueError("No readable text could be extracted from this file.")

        raw_chunks = chunk_sections(sections)
        texts = [c["content"] for c in raw_chunks]
        vectors, emb_model = embed_texts(texts)

        # Clean any previous chunks for this document before re-inserting
        db["documentchunks"].delete_many({"documentId": doc_oid, "userId": user_oid})

        now = datetime.now(timezone.utc)
        chunk_docs = []
        for ch, vec in zip(raw_chunks, vectors):
            chunk_docs.append(
                {
                    "userId": user_oid,
                    "documentId": doc_oid,
                    "subjectId": subj_oid,
                    "chapterId": chap_oid,
                    "topicIds": [],
                    "chunkIndex": ch["chunk_index"],
                    "pageNumber": ch["page_number"],
                    "sectionTitle": ch["section_title"],
                    "documentName": req.documentName,
                    "chapterTitle": req.chapterTitle or "",
                    "content": ch["content"],
                    "tokenCount": ch["token_count"],
                    "embedding": vec,
                    "embeddingModel": emb_model,
                    "isDemo": req.isDemo,
                    "createdAt": now,
                    "updatedAt": now,
                }
            )

        if chunk_docs:
            db["documentchunks"].insert_many(chunk_docs)

        preview_text = sections[0]["text"][:500]
        db["documents"].update_one(
            {"_id": doc_oid, "userId": user_oid},
            {
                "$set": {
                    "processingStatus": "indexed",
                    "pageCount": page_count,
                    "chunkCount": len(chunk_docs),
                    "extractedCharCount": total_chars,
                    "previewText": preview_text,
                    "errorMessage": "",
                    "updatedAt": now,
                }
            },
        )

        return {
            "success": True,
            "documentId": req.documentId,
            "chunkCount": len(chunk_docs),
            "pageCount": page_count,
            "extractedCharCount": total_chars,
            "embeddingModel": emb_model,
        }
    except Exception as e:
        db["documents"].update_one(
            {"_id": doc_oid, "userId": user_oid},
            {
                "$set": {
                    "processingStatus": "failed",
                    "errorMessage": str(e)[:400],
                    "updatedAt": datetime.now(timezone.utc),
                }
            },
        )
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")


@app.post("/rag/search")
def semantic_search(req: SearchRequest):
    chunks = retrieve_chunks(
        user_id=req.userId,
        subject_id=req.subjectId,
        query=req.query,
        top_k=req.topK,
        chapter_id=req.chapterId,
    )
    return {"success": True, "count": len(chunks), "results": chunks}


@app.post("/rag/generate-questions")
def rag_generate_questions(req: GenerateQuestionsRequest):
    topic_blocks = []
    total_chunks_found = 0

    for t in req.topics:
        query_text = f"{t.topicName} {t.chapterTitle or ''} {t.description or ''}".strip()
        chunks = retrieve_chunks(
            user_id=req.userId,
            subject_id=req.subjectId,
            query=query_text,
            top_k=4,
            chapter_id=t.chapterId,
            min_score=0.04,
        )
        total_chunks_found += len(chunks)
        topic_blocks.append(
            {
                "topicId": t.topicId,
                "topicName": t.topicName,
                "chapterId": t.chapterId,
                "masteryScore": t.masteryScore,
                "chunks": chunks,
            }
        )

    if total_chunks_found == 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "No indexed study material chunks were found for this subject. "
                "Please upload and index at least one study document before generating a RAG assessment."
            ),
        )

    questions = generate_grounded_questions(
        topic_blocks=topic_blocks,
        total_count=req.questionCount,
        difficulty=req.difficulty,
        question_types=req.questionTypes,
    )

    if not questions:
        raise HTTPException(
            status_code=400,
            detail="Could not synthesize questions from the retrieved material. Please upload richer study notes.",
        )

    return {
        "success": True,
        "aiMode": get_llm_mode(),
        "retrievedChunksUsed": total_chunks_found,
        "questions": questions,
    }


@app.post("/rag/evaluate-answer")
def rag_evaluate_answer(req: EvaluateAnswerRequest):
    result = evaluate_student_answer(req.question, req.selectedAnswer)
    return {"success": True, **result}


@app.post("/rag/chat")
def rag_chat(req: ChatRequest):
    chunks = retrieve_chunks(
        user_id=req.userId,
        subject_id=req.subjectId,
        query=req.message,
        top_k=4,
        min_score=0.06,
    )
    reply_data = generate_rag_chat_reply(
        query=req.message,
        retrieved_chunks=chunks,
        subject_name=req.subjectName,
        weak_topics=req.weakTopics,
        history=req.history,
    )
    return {"success": True, "aiMode": get_llm_mode(), **reply_data}
