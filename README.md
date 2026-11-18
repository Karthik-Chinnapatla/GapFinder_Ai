# GapFinder AI — Find What the Student Doesn't Know

> **"GapFinder AI doesn't just teach students what they ask. It discovers what they don't know."**

GapFinder AI is a full-stack AI-powered educational diagnostic platform built with **React + Tailwind CSS + Recharts**, **Node.js + Express + Mongoose**, **MongoDB Atlas (`gapfinder_db`)**, and a modular **Python FastAPI RAG & AI microservice**.

## Architecture

- **`frontend/`** — React + Vite + Tailwind CSS SaaS Dashboard (`http://localhost:5173`)
- **`backend/`** — Express + Mongoose REST API, Auth (JWT + bcrypt), Diagnosis Engine, Dynamic Revision Planner (`http://127.0.0.1:5000`)
- **`ai-service/`** — Python FastAPI RAG pipeline: PDF/DOCX/TXT extraction, overlapping semantic chunking, dense embeddings, hybrid vector retrieval over MongoDB `documentchunks`, grounded question generation, answer evaluation, and source-cited RAG study chat (`http://127.0.0.1:8001`)

## Database (`gapfinder_db` on MongoDB Atlas)

- Reuses existing `users` collection via Mongoose (`User` model).
- Adds strictly necessary domain collections: `subjects`, `chapters`, `topics`, `documents`, `documentchunks`, `assessments`, `questions`, `studentanswers`, `topicperformances`, `revisionplans`, `revisiontasks`, `chathistories`.

## Running Locally

### Option 1: Start All Services
```powershell
.\start-dev.ps1
```

### Option 2: Start Manually in 3 Terminals
1. **Python AI/RAG Service (port 8001):**
   ```powershell
   cd ai-service
   .\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001
   ```
2. **Node.js Express Backend (port 5000):**
   ```powershell
   cd backend
   npm start
   ```
3. **React Vite Frontend (port 5173):**
   ```powershell
   cd frontend
   npm run dev
   ```

## Optional LLM API Keys

GapFinder AI works out of the box with its local hybrid semantic embeddings and source-grounded RAG engine. To enable Gemini, OpenAI, or Groq generation, set `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `GROQ_API_KEY` in `ai-service/.env` and restart the AI service.

## Live App & Demo Login Credentials

- **Live Website:** https://gap-finder-ai-vs6q.vercel.app
- **Email:** `demo.student@gapfinder.ai`
- **Password:** `GapFinderDemo2026!`

You can sign in directly with the credentials above or click **"Try Sample Student Account"** on the login page to explore a complete Data Structures (`CS201`) student profile with 7 syllabus chapters, 6 indexed study materials, 3 historical assessments, real topic mastery progression (e.g. Linked Lists `33% -> 54% -> 78%`), a critical gap in Binary Trees & BSTs, an evidence-guardrailed Insufficient Data topic (Sorting Algorithms), and an adaptive Personalized Revision Plan so students can see how GapFinder catches important missed concepts.
