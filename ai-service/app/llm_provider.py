import json
import re
import random
from typing import List, Dict, Optional
import httpx
from .config import GEMINI_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, get_llm_mode
from .embeddings import local_embed, cosine_similarity, tokenize


def _extract_json_block(text: str):
    text = text.strip()
    # Strip markdown fences if present
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    return json.loads(text)


def call_llm(system_prompt: str, user_prompt: str, expect_json: bool = False) -> Optional[str]:
    mode = get_llm_mode()
    if mode == "local-grounded-rag":
        return None

    try:
        if mode == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
            payload = {
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"parts": [{"text": user_prompt}]}],
                "generationConfig": {"temperature": 0.3},
            }
            if expect_json:
                payload["generationConfig"]["responseMimeType"] = "application/json"
            with httpx.Client(timeout=35.0) as client:
                r = client.post(url, json=payload)
                r.raise_for_status()
                return r.json()["candidates"][0]["content"]["parts"][0]["text"]

        if mode == "openai":
            payload = {
                "model": "gpt-4o-mini",
                "temperature": 0.3,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
            if expect_json:
                payload["response_format"] = {"type": "json_object"}
            with httpx.Client(timeout=35.0) as client:
                r = client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    json=payload,
                )
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"]

        if mode == "groq":
            payload = {
                "model": "llama-3.3-70b-versatile",
                "temperature": 0.3,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
            if expect_json:
                payload["response_format"] = {"type": "json_object"}
            with httpx.Client(timeout=35.0) as client:
                r = client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                    json=payload,
                )
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"[LLM] {mode} call failed, falling back to local grounded RAG engine: {e}")
        return None
    return None


def _split_clean_sentences(text: str) -> List[str]:
    sents = re.split(r"(?<=[.!?])\s+", text.strip())
    return [s.strip() for s in sents if 30 <= len(s.strip()) <= 320]


def _extract_facts_from_chunk(chunk: Dict) -> List[Dict]:
    """
    Extracts structured factual statements (definitions, complexities, contrasts, properties)
    directly from a retrieved chunk so local RAG questions are 100% grounded in the source.
    """
    content = chunk.get("content", "")
    sents = _split_clean_sentences(content)
    facts = []

    for s in sents:
        # 1. Big-O / complexity facts
        bigo = re.search(r"(O\([A-Za-z0-9\s\+\*\^\(\)lognVEmk]+\))", s)
        # 2. Definition pattern: "X is/are/refers to/stores/uses Y"
        defn = re.match(
            r"^([A-Z][A-Za-z0-9\s\-/()]{2,55}?)\s+(is|are|refers to|means|uses|stores|follows|maintains|guarantees|requires)\s+(.{18,})$",
            s,
        )
        # 3. Contrast pattern
        contrast = re.search(r"\b(unlike|whereas|however|instead of|in contrast to|rather than)\b", s, re.IGNORECASE)

        if defn:
            facts.append(
                {
                    "kind": "definition",
                    "subject": defn.group(1).strip(),
                    "verb": defn.group(2).strip(),
                    "predicate": defn.group(3).strip().rstrip("."),
                    "sentence": s,
                    "bigo": bigo.group(1) if bigo else None,
                    "chunk": chunk,
                }
            )
        elif bigo:
            facts.append(
                {
                    "kind": "complexity",
                    "subject": chunk.get("sectionTitle") or "This operation",
                    "verb": "runs in",
                    "predicate": s,
                    "sentence": s,
                    "bigo": bigo.group(1),
                    "chunk": chunk,
                }
            )
        elif contrast:
            facts.append(
                {
                    "kind": "contrast",
                    "subject": chunk.get("sectionTitle") or "This concept",
                    "verb": "differs",
                    "predicate": s,
                    "sentence": s,
                    "bigo": None,
                    "chunk": chunk,
                }
            )
        else:
            facts.append(
                {
                    "kind": "statement",
                    "subject": chunk.get("sectionTitle") or "The topic",
                    "verb": "states",
                    "predicate": s,
                    "sentence": s,
                    "bigo": None,
                    "chunk": chunk,
                }
            )
    return facts


def _make_citation(chunk: Dict) -> Dict:
    return {
        "documentId": chunk.get("documentId"),
        "documentName": chunk.get("documentName") or "Study Material",
        "chapterTitle": chunk.get("chapterTitle") or "",
        "pageNumber": chunk.get("pageNumber", None),
        "sectionTitle": chunk.get("sectionTitle") or "",
        "chunkId": chunk.get("chunkId"),
        "excerpt": (chunk.get("content") or "")[:240],
    }


def _mutate_false_statement(sentence: str) -> Optional[str]:
    swaps = [
        (r"\bLIFO\b", "FIFO"),
        (r"\bFIFO\b", "LIFO"),
        (r"\bO\(1\)", "O(n^2)"),
        (r"\bO\(log n\)", "O(n^2)"),
        (r"\bO\(n log n\)", "O(1)"),
        (r"\bcontiguous\b", "non-contiguous"),
        (r"\bnon-contiguous\b", "contiguous"),
        (r"\bsorted\b", "unsorted"),
        (r"\bin-order\b", "pre-order"),
        (r"\binorder\b", "preorder"),
        (r"\bstrictly smaller\b", "strictly larger"),
        (r"\bless than\b", "greater than"),
        (r"\bgreater than\b", "less than"),
        (r"\bstack\b", "queue"),
        (r"\bqueue\b", "stack"),
        (r"\bBFS\b", "DFS"),
        (r"\bDFS\b", "BFS"),
        (r"\bdirected\b", "undirected"),
        (r"\bstable\b", "unstable"),
        (r"\bworst-case\b", "best-case"),
    ]
    for pat, repl in swaps:
        if re.search(pat, sentence, re.IGNORECASE):
            mutated = re.sub(pat, repl, sentence, count=1, flags=re.IGNORECASE)
            if mutated != sentence:
                return mutated
    return None


def _build_local_questions(
    topic_blocks: List[Dict],
    total_count: int,
    difficulty: str,
    question_types: List[str],
) -> List[Dict]:
    """
    Synthesizes genuinely source-grounded questions directly from retrieved MongoDB document chunks.
    """
    if not question_types:
        question_types = ["mcq", "true_false", "short_answer", "conceptual"]

    all_predicates: List[str] = []
    all_bigos = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(V + E)"]

    topic_facts = []
    for tb in topic_blocks:
        facts = []
        for ch in tb.get("chunks", []):
            extracted = _extract_facts_from_chunk(ch)
            facts.extend(extracted)
            for f in extracted:
                if f["kind"] == "definition" and 20 <= len(f["predicate"]) <= 145:
                    all_predicates.append(f["predicate"])
        topic_facts.append((tb, facts))

    # Fallback pool of distractors drawn from other chunks' sentences
    if len(all_predicates) < 6:
        for _, facts in topic_facts:
            for f in facts:
                p = f["sentence"][:140].rstrip(".")
                if p not in all_predicates:
                    all_predicates.append(p)

    questions = []
    used_prompts = set()
    q_idx = 0
    attempts = 0
    max_attempts = total_count * 6

    while len(questions) < total_count and attempts < max_attempts:
        tb, facts = topic_facts[attempts % len(topic_facts)]
        attempts += 1
        if not facts:
            continue

        fact = facts[(attempts // max(1, len(topic_facts))) % len(facts)]
        chunk = fact["chunk"]
        qtype = question_types[q_idx % len(question_types)]
        topic_name = tb["topicName"]
        citation = _make_citation(chunk)
        q_diff = "medium" if difficulty == "adaptive" else difficulty
        if difficulty == "adaptive":
            m = tb.get("masteryScore")
            q_diff = "easy" if (m is not None and m < 45) else ("hard" if (m is not None and m >= 75) else "medium")

        q_obj = None

        if qtype == "mcq":
            if fact["bigo"] and fact["kind"] in ("complexity", "definition"):
                correct_bigo = fact["bigo"]
                # Mask the Big-O in the sentence to create a precise question
                masked = fact["sentence"].replace(correct_bigo, "____", 1)
                distractors = [b for b in all_bigos if b.lower() != correct_bigo.lower()]
                random.shuffle(distractors)
                opts = [correct_bigo] + distractors[:3]
                random.shuffle(opts)
                prompt = f"According to your study material on {topic_name}, which complexity correctly completes this statement?\n\"{masked}\""
                q_obj = {
                    "topicId": tb["topicId"],
                    "topicName": topic_name,
                    "chapterId": tb.get("chapterId"),
                    "questionType": "mcq",
                    "difficulty": q_diff,
                    "prompt": prompt,
                    "options": opts,
                    "correctAnswer": correct_bigo,
                    "expectedKeywords": [correct_bigo],
                    "explanation": f"Your notes explicitly state: \"{fact['sentence']}\"",
                    "misconceptionTrap": f"Confusing time/space complexity bounds in {topic_name}",
                    "sourceCitation": citation,
                }
            elif fact["kind"] == "definition":
                correct_pred = fact["predicate"][:145]
                distractors = [
                    p for p in all_predicates
                    if p.lower() != correct_pred.lower()
                    and len(set(tokenize(p)) & set(tokenize(correct_pred))) <= 2
                ]
                random.shuffle(distractors)
                while len(distractors) < 3:
                    filler = [
                        f"It always operates in constant O(1) space without storing any references or ordering constraints",
                        f"It prohibits sequential traversal and can only store unordered boolean flags",
                        f"It automatically rebalances every element using quadratic pairwise comparisons on each read",
                    ][len(distractors)]
                    distractors.append(filler)
                opts = [correct_pred] + distractors[:3]
                random.shuffle(opts)
                prompt = f"Based on your uploaded notes for {topic_name}, how is \"{fact['subject']}\" accurately described?"
                q_obj = {
                    "topicId": tb["topicId"],
                    "topicName": topic_name,
                    "chapterId": tb.get("chapterId"),
                    "questionType": "mcq",
                    "difficulty": q_diff,
                    "prompt": prompt,
                    "options": opts,
                    "correctAnswer": correct_pred,
                    "expectedKeywords": tokenize(correct_pred)[:6],
                    "explanation": f"Source confirmation: \"{fact['sentence']}\"",
                    "misconceptionTrap": f"Misunderstanding the core definition of {fact['subject']} in {topic_name}",
                    "sourceCitation": citation,
                }
            else:
                # Fallback MCQ from statement
                correct_stmt = fact["sentence"][:150]
                distractors = [p for p in all_predicates if p[:60].lower() != correct_stmt[:60].lower()]
                random.shuffle(distractors)
                mutated = _mutate_false_statement(correct_stmt)
                cand_d = ([mutated] if mutated else []) + distractors
                while len(cand_d) < 3:
                    cand_d.append(f"None of the properties of {topic_name} depend on structural invariants or memory layout.")
                opts = [correct_stmt] + cand_d[:3]
                random.shuffle(opts)
                prompt = f"Which statement about {topic_name} is directly supported by your study material?"
                q_obj = {
                    "topicId": tb["topicId"],
                    "topicName": topic_name,
                    "chapterId": tb.get("chapterId"),
                    "questionType": "mcq",
                    "difficulty": q_diff,
                    "prompt": prompt,
                    "options": opts,
                    "correctAnswer": correct_stmt,
                    "expectedKeywords": tokenize(correct_stmt)[:6],
                    "explanation": f"Directly supported by your material: \"{fact['sentence']}\"",
                    "misconceptionTrap": f"Confusing structural properties of {topic_name}",
                    "sourceCitation": citation,
                }

        elif qtype == "true_false":
            mutated = _mutate_false_statement(fact["sentence"])
            make_false = (q_idx % 2 == 1) and (mutated is not None)
            stmt = mutated if make_false else fact["sentence"]
            ans = "False" if make_false else "True"
            prompt = f"True or False (grounded in {topic_name} notes): \"{stmt}\""
            q_obj = {
                "topicId": tb["topicId"],
                "topicName": topic_name,
                "chapterId": tb.get("chapterId"),
                "questionType": "true_false",
                "difficulty": q_diff,
                "prompt": prompt,
                "options": ["True", "False"],
                "correctAnswer": ans,
                "expectedKeywords": [ans.lower()],
                "explanation": (
                    f"This statement is False. Your study material states: \"{fact['sentence']}\""
                    if make_false
                    else f"This statement is True, as confirmed by your study material: \"{fact['sentence']}\""
                ),
                "misconceptionTrap": f"Reversing key invariants or ordering rules in {topic_name}",
                "sourceCitation": citation,
            }

        elif qtype == "short_answer":
            subj = fact["subject"] if fact["kind"] == "definition" else topic_name
            keywords = list(dict.fromkeys(tokenize(fact["sentence"])))[:8]
            prompt = f"In 1–2 sentences, explain the role or key property of {subj} in {topic_name} based on your study material."
            q_obj = {
                "topicId": tb["topicId"],
                "topicName": topic_name,
                "chapterId": tb.get("chapterId"),
                "questionType": "short_answer",
                "difficulty": q_diff,
                "prompt": prompt,
                "options": [],
                "correctAnswer": fact["sentence"],
                "expectedKeywords": keywords,
                "explanation": f"Expected concept from your notes: \"{fact['sentence']}\"",
                "misconceptionTrap": f"Incomplete recall of {subj} mechanics in {topic_name}",
                "sourceCitation": citation,
            }

        else:  # conceptual
            keywords = list(dict.fromkeys(tokenize(chunk["content"])))[:10]
            section_ref = chunk.get("sectionTitle") or topic_name
            prompt = (
                f"Conceptual check ({topic_name} — {section_ref}): "
                f"Why is the property described below important, and what breaks or degrades if it is violated?\n"
                f"Context hint: {fact['subject']}"
            )
            q_obj = {
                "topicId": tb["topicId"],
                "topicName": topic_name,
                "chapterId": tb.get("chapterId"),
                "questionType": "conceptual",
                "difficulty": q_diff,
                "prompt": prompt,
                "options": [],
                "correctAnswer": fact["sentence"],
                "expectedKeywords": keywords,
                "explanation": f"From your material ({section_ref}): \"{fact['sentence']}\"",
                "misconceptionTrap": f"Weak conceptual reasoning around {section_ref} in {topic_name}",
                "sourceCitation": citation,
            }

        if q_obj and q_obj["prompt"] not in used_prompts:
            used_prompts.add(q_obj["prompt"])
            questions.append(q_obj)
            q_idx += 1

    return questions


def generate_grounded_questions(
    topic_blocks: List[Dict],
    total_count: int,
    difficulty: str,
    question_types: List[str],
) -> List[Dict]:
    """
    Generates RAG-grounded questions using an external LLM if configured,
    strictly constrained to the retrieved chunks; falls back cleanly to the
    local grounded RAG synthesizer if no API key is configured.
    """
    if get_llm_mode() != "local-grounded-rag":
        context_lines = []
        chunk_lookup = {}
        for tb in topic_blocks:
            context_lines.append(f"### TOPIC: {tb['topicName']} (topicId={tb['topicId']}, chapterId={tb.get('chapterId')})")
            for ch in tb.get("chunks", [])[:3]:
                cid = ch["chunkId"]
                chunk_lookup[cid] = ch
                pg = f", Page {ch['pageNumber']}" if ch.get("pageNumber") else ""
                context_lines.append(
                    f"[CHUNK {cid} | Doc: {ch['documentName']} | Section: {ch.get('sectionTitle','')}{pg}]\n{ch['content']}"
                )

        system_prompt = (
            "You are GapFinder AI's strict RAG assessment engine. "
            "Generate educational diagnostic questions ONLY from the provided retrieved chunks. "
            "Never invent facts, never fabricate page numbers, and reference the exact chunkId for every question. "
            "Return valid JSON: {\"questions\": [{\"topicId\", \"topicName\", \"chapterId\", \"questionType\", "
            "\"difficulty\", \"prompt\", \"options\", \"correctAnswer\", \"expectedKeywords\", \"explanation\", "
            "\"misconceptionTrap\", \"chunkId\"}]}."
        )
        user_prompt = (
            f"Generate exactly {total_count} diagnostic questions distributed across the topics below.\n"
            f"Allowed questionTypes: {question_types}. Target difficulty: {difficulty}.\n"
            f"For mcq provide 4 options; for true_false provide [\"True\", \"False\"]; for short_answer/conceptual provide [].\n\n"
            + "\n\n".join(context_lines)
        )
        raw = call_llm(system_prompt, user_prompt, expect_json=True)
        if raw:
            try:
                parsed = _extract_json_block(raw)
                items = parsed.get("questions", parsed) if isinstance(parsed, dict) else parsed
                validated = []
                for q in items[:total_count]:
                    ch = chunk_lookup.get(str(q.get("chunkId", "")))
                    if not ch:
                        # Attach first chunk of matching topic
                        for tb in topic_blocks:
                            if tb["topicId"] == q.get("topicId") and tb.get("chunks"):
                                ch = tb["chunks"][0]
                                break
                    if not ch:
                        continue
                    validated.append(
                        {
                            "topicId": q["topicId"],
                            "topicName": q["topicName"],
                            "chapterId": q.get("chapterId"),
                            "questionType": q.get("questionType", "mcq"),
                            "difficulty": q.get("difficulty", "medium") if q.get("difficulty") in ("easy", "medium", "hard") else "medium",
                            "prompt": q["prompt"],
                            "options": q.get("options") or [],
                            "correctAnswer": str(q.get("correctAnswer", "")),
                            "expectedKeywords": q.get("expectedKeywords") or [],
                            "explanation": q.get("explanation") or "",
                            "misconceptionTrap": q.get("misconceptionTrap") or f"Conceptual gap in {q['topicName']}",
                            "sourceCitation": _make_citation(ch),
                        }
                    )
                if validated:
                    return validated
            except Exception as e:
                print(f"[RAG QuestionGen] Failed to parse LLM JSON, using local grounded generator: {e}")

    return _build_local_questions(topic_blocks, total_count, difficulty, question_types)


def evaluate_student_answer(question: Dict, selected_answer: str) -> Dict:
    """
    Evaluates MCQ, True/False, Short Answer, and Conceptual responses.
    Returns: { isCorrect, partialScore, aiFeedback, identifiedMisconception }
    """
    qtype = question.get("questionType", "mcq")
    correct = (question.get("correctAnswer") or "").strip()
    given = (selected_answer or "").strip()
    explanation = question.get("explanation") or ""
    trap = question.get("misconceptionTrap") or f"Conceptual gap in {question.get('topicName', 'this topic')}"

    if not given:
        return {
            "isCorrect": False,
            "partialScore": 0.0,
            "aiFeedback": f"No answer submitted. {explanation}",
            "identifiedMisconception": f"Unanswered concept: {trap}",
        }

    if qtype in ("mcq", "true_false"):
        is_right = given.lower() == correct.lower()
        return {
            "isCorrect": is_right,
            "partialScore": 1.0 if is_right else 0.0,
            "aiFeedback": (
                f"Correct! {explanation}"
                if is_right
                else f"Incorrect. You selected \"{given}\", while the source-grounded answer is \"{correct}\". {explanation}"
            ),
            "identifiedMisconception": "" if is_right else trap,
        }

    # Short answer / Conceptual evaluation
    if get_llm_mode() != "local-grounded-rag":
        system_prompt = (
            "You are a strict, encouraging educational evaluator for GapFinder AI. "
            "Evaluate the student's answer strictly against the reference answer and source excerpt. "
            "Return JSON: {\"isCorrect\": bool, \"partialScore\": float (0..1), \"aiFeedback\": str, \"identifiedMisconception\": str}."
        )
        user_prompt = (
            f"Question: {question.get('prompt')}\n"
            f"Reference Answer: {correct}\n"
            f"Source Excerpt: {(question.get('sourceCitation') or {}).get('excerpt', '')}\n"
            f"Student Answer: {given}"
        )
        raw = call_llm(system_prompt, user_prompt, expect_json=True)
        if raw:
            try:
                res = _extract_json_block(raw)
                return {
                    "isCorrect": bool(res.get("isCorrect", False)),
                    "partialScore": max(0.0, min(1.0, float(res.get("partialScore", 0.0)))),
                    "aiFeedback": str(res.get("aiFeedback", explanation)),
                    "identifiedMisconception": "" if res.get("isCorrect") else str(res.get("identifiedMisconception") or trap),
                }
            except Exception:
                pass

    # Local semantic + keyword overlap evaluator
    given_vec = local_embed(given)
    ref_vec = local_embed(correct + " " + (question.get("sourceCitation") or {}).get("excerpt", ""))
    sem_sim = max(0.0, cosine_similarity(given_vec, ref_vec))

    expected_kw = set(tokenize(" ".join(question.get("expectedKeywords") or []) + " " + correct))
    given_kw = set(tokenize(given))
    kw_recall = (len(expected_kw & given_kw) / max(1, min(len(expected_kw), 6))) if expected_kw else 0.0
    kw_recall = min(1.0, kw_recall)

    score = round(min(1.0, 0.55 * sem_sim + 0.45 * kw_recall), 2)
    is_right = score >= 0.48
    if is_right:
        feedback = f"Good understanding (alignment score {int(score * 100)}%). {explanation}"
        misconception = ""
    elif score >= 0.25:
        feedback = f"Partially correct ({int(score * 100)}% concept alignment), but missing key specifics from your notes. {explanation}"
        misconception = trap
    else:
        feedback = f"Your response misses the core concept from your uploaded material. {explanation}"
        misconception = trap

    return {
        "isCorrect": is_right,
        "partialScore": 1.0 if score >= 0.72 else score,
        "aiFeedback": feedback,
        "identifiedMisconception": misconception,
    }


def generate_rag_chat_reply(
    query: str,
    retrieved_chunks: List[Dict],
    subject_name: str,
    weak_topics: List[str],
    history: List[Dict],
) -> Dict:
    """
    Strictly source-grounded RAG Study Assistant.
    Never fabricates answers or citations when no relevant chunks are retrieved.
    """
    if not retrieved_chunks or retrieved_chunks[0].get("relevanceScore", 0) < 0.12:
        return {
            "reply": (
                f"I could not find relevant passages in your uploaded study materials for **{subject_name}** "
                f"to answer that question reliably. Please upload notes, slides, or textbook chapters covering "
                f"this topic on the **Study Materials** page so I can give you a source-grounded, cited answer."
            ),
            "grounded": False,
            "citations": [],
            "relatedTopics": weak_topics[:3],
        }

    citations = []
    for ch in retrieved_chunks[:4]:
        citations.append(
            {
                "documentId": ch["documentId"],
                "documentName": ch["documentName"],
                "chapterTitle": ch.get("chapterTitle", ""),
                "pageNumber": ch.get("pageNumber", None),
                "sectionTitle": ch.get("sectionTitle", ""),
                "excerpt": ch.get("excerpt", ""),
                "relevanceScore": ch.get("relevanceScore", 0),
            }
        )

    if get_llm_mode() != "local-grounded-rag":
        ctx = []
        for idx, ch in enumerate(retrieved_chunks[:4], start=1):
            pg = f", Page {ch['pageNumber']}" if ch.get("pageNumber") else ""
            sec = f" — {ch['sectionTitle']}" if ch.get("sectionTitle") else ""
            ctx.append(f"[Source {idx}: {ch['documentName']}{sec}{pg}]\n{ch['content']}")

        system_prompt = (
            f"You are GapFinder AI's Study Assistant for {subject_name}. "
            "Answer ONLY using the provided retrieved excerpts from the student's uploaded materials. "
            "Cite sources inline like [Source 1]. Never fabricate page numbers or facts not in the excerpts. "
            "If the excerpts don't cover part of the question, explicitly say so."
        )
        user_prompt = f"Student Question: {query}\n\nRetrieved Study Material:\n" + "\n\n".join(ctx)
        llm_reply = call_llm(system_prompt, user_prompt, expect_json=False)
        if llm_reply:
            return {
                "reply": llm_reply.strip(),
                "grounded": True,
                "citations": citations,
                "relatedTopics": weak_topics[:3],
            }

    # Local grounded RAG synthesis directly citing the retrieved chunks
    top = retrieved_chunks[:3]
    lines = [f"Based on your uploaded **{subject_name}** study materials, here is what your notes cover:\n"]
    for idx, ch in enumerate(top, start=1):
        pg = f", Page {ch['pageNumber']}" if ch.get("pageNumber") else ""
        sec = f" ({ch['sectionTitle']})" if ch.get("sectionTitle") else ""
        sents = _split_clean_sentences(ch["content"])
        summary = " ".join(sents[:3]) if sents else ch["content"][:320]
        lines.append(f"- **[Source {idx}: {ch['documentName']}{sec}{pg}]** {summary}")

    if weak_topics:
        lines.append(
            f"\n**Diagnostic tip:** Your current priority gap topics in {subject_name} include "
            f"**{', '.join(weak_topics[:3])}**. Consider running a quick targeted assessment after reviewing these passages."
        )

    return {
        "reply": "\n".join(lines),
        "grounded": True,
        "citations": citations,
        "relatedTopics": weak_topics[:3],
    }
