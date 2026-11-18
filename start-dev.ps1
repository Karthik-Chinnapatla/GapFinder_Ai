$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting GapFinder AI Python RAG Service (port 8001)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\ai-service'; .\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001"

Write-Host "Starting GapFinder AI Express Backend (port 5000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; npm run dev"

Write-Host "Starting GapFinder AI Frontend (port 5173)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host "All services launched! Open http://localhost:5173 in your browser." -ForegroundColor Green
