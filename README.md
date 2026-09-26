# researchai-assistant-school

**aas_41 – School Project Helper** is a Node.js web app that turns a topic into a
complete, student-friendly school project writeup or assignment handout — with real
sources, citations, and images.

It gathers background material from Wikipedia, web search, and page extraction, then
uses an LLM (OpenAI, OpenRouter, or a local Ollama model) to write the final document.
If no LLM is available, it falls back to a structured template built from the sources.

## Features

- **Project mode** — generates a full writeup: title, abstract, introduction,
  background, key facts, timeline, real-world applications, conclusion,
  presentation outline, and references.
- **Assignment mode** — generates a teacher-ready handout: overview, learning
  objectives, vocabulary, task instructions, deliverables, formatting rules,
  and a 100-point grading rubric.
- **Grade levels** — middle school, high school, and college tones.
- **Project types** — report, presentation, poster, science fair.
- **Automatic research** — pulls a Wikipedia topic pack, searches the web
  (Serper API with a Bing scrape fallback), extracts page text, and finds
  Wikimedia Commons images.
- **Citations** — sources are numbered `[1]`, `[2]`, … and mapped to URLs.
- **Provider auto-detection** — picks OpenAI → OpenRouter → local Ollama based
  on which credentials are configured, or follows `LLM_PROVIDER` explicitly.
- **No-LLM fallback** — still produces a structured document from the sources.
- **Offline mode** — toggleable at runtime; blocks web requests when enabled.
- **Copy / download** — copy or download the generated project from the UI.

## Getting started

### Prerequisites

- Node.js 18+
- npm
- (Optional) an [OpenAI](https://platform.openai.com/) or
  [OpenRouter](https://openrouter.ai/) API key, or a local
  [Ollama](https://ollama.com/) install
- (Optional) a [Serper](https://serper.dev/) API key for better web search
  (the app falls back to scraping Bing results without one)

### Install

```bash
npm install
```

### Configure

Copy the template and fill in your keys — **never commit your `.env` file**:

```bash
cp .env.example .env
```

| Variable             | Required | Description                                              |
| -------------------- | -------- | -------------------------------------------------------- |
| `PORT`               | No       | Server port (default `4011`)                             |
| `OFFLINE_MODE`       | No       | Start with offline mode enabled (`true`/`false`)         |
| `LLM_PROVIDER`       | No       | Force a provider: `openai`, `openrouter`, or `ollama`    |
| `OPENAI_API_KEY`     | No       | OpenAI API key                                           |
| `OPENAI_MODEL`       | No       | OpenAI model (default `gpt-4o-mini`)                     |
| `OPENROUTER_API_KEY` | No       | OpenRouter API key                                       |
| `OPENROUTER_MODEL`   | No       | OpenRouter model (default `openai/gpt-4o-mini`)          |
| `OLLAMA_BASE_URL`    | No       | Local Ollama URL (default `http://localhost:11434`)      |
| `OLLAMA_MODEL`       | No       | Local Ollama model (default `llama3.1`)                  |
| `SERPER_API_KEY`     | No       | Serper API key for web search (optional)                 |

All keys are loaded from `.env` via `dotenv` and read only from `process.env` —
no credentials are hardcoded in the source.

### Run

```bash
npm start        # production
npm run dev      # nodemon auto-reload
```

Then open <http://localhost:4011>.

## API

| Method   | Endpoint         | Description                                          |
| -------- | ---------------- | ---------------------------------------------------- |
| `GET`    | `/`              | Web UI                                               |
| `GET`    | `/healthz`       | Health check                                         |
| `GET`    | `/api/providers` | Which providers/keys are detected + offline status   |
| `GET`    | `/api/offline`   | Current offline mode                                 |
| `POST`   | `/api/offline`   | Toggle offline mode (`{ "offline": true }`)          |
| `POST`   | `/api/project`   | Generate a project or assignment                     |

Example:

```bash
curl -X POST http://localhost:4011/api/project \
  -H "Content-Type: application/json" \
  -d '{"topic": "The Water Cycle", "mode": "project", "gradeLevel": "high_school"}'
```

## Project structure

```
├── public/            # Vanilla HTML/CSS/JS frontend
├── src/
│   ├── ai/
│   │   ├── fetchPage.js   # Fetch + extract page text (cheerio)
│   │   ├── llmClient.js   # OpenAI / OpenRouter / Ollama client with retries
│   │   ├── search.js      # Serper search with Bing scrape fallback
│   │   └── wiki.js        # Wikipedia topic pack + Wikimedia Commons images
│   ├── config/
│   │   └── runtimeConfig.js   # Offline-mode runtime state
│   └── server.js      # Express app, prompts, and API routes
├── .env.example       # Environment template (safe to commit)
└── package.json
```

## Security notes

- All API keys live in `.env`, which is git-ignored and never pushed.
- `.env.example` is the only env file committed — it contains empty placeholders.
- If a secret is ever accidentally committed, rotate (revoke) the key
  immediately; removing it from the code alone is not enough.
