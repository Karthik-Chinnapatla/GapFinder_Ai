const axios = require('axios');

const AI_BASE = () => (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');

const client = axios.create({
  timeout: 45000,
});

async function checkAiHealth() {
  try {
    const { data } = await client.get(`${AI_BASE()}/health`, { timeout: 4000 });
    return data;
  } catch (err) {
    return { status: 'offline', error: err.message };
  }
}

async function indexDocumentInAI(payload) {
  const { data } = await client.post(`${AI_BASE()}/rag/index-document`, payload, { timeout: 60000 });
  return data;
}

async function semanticSearchInAI(payload) {
  const { data } = await client.post(`${AI_BASE()}/rag/search`, payload);
  return data;
}

async function generateQuestionsInAI(payload) {
  const { data } = await client.post(`${AI_BASE()}/rag/generate-questions`, payload, { timeout: 60000 });
  return data;
}

async function evaluateAnswerInAI(payload) {
  const { data } = await client.post(`${AI_BASE()}/rag/evaluate-answer`, payload);
  return data;
}

async function chatWithAI(payload) {
  const { data } = await client.post(`${AI_BASE()}/rag/chat`, payload, { timeout: 45000 });
  return data;
}

module.exports = {
  checkAiHealth,
  indexDocumentInAI,
  semanticSearchInAI,
  generateQuestionsInAI,
  evaluateAnswerInAI,
  chatWithAI,
};
