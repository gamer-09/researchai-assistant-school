const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const { fetch } = require('undici');

const { chat, getProvider } = require('./ai/llmClient');
const { webSearch } = require('./ai/search');
const { fetchAndExtract } = require('./ai/fetchPage');
const { getWikipediaTopicPack, searchWikimediaCommonsImages } = require('./ai/wiki');
const { isOffline, setOffline, OFFLINE_DEFAULT } = require('./config/runtimeConfig');

const app = express();
const port = process.env.PORT || 4011;

app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

async function probeLocalOllama(timeoutMs = 600) {
  const base = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}/api/tags`, { method: 'GET', signal: ctrl.signal });
    return resp.ok;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(t);
  }
}

app.get('/api/providers', async (req, res) => {
  const prov = (process.env.LLM_PROVIDER || '').toLowerCase() || getProvider();
  const hasOllamaLocal = await probeLocalOllama(500);
  const offline = isOffline();
  res.json({
    provider: prov,
    offline,
    defaultOffline: OFFLINE_DEFAULT,
    hasOpenAI: !offline && !!process.env.OPENAI_API_KEY,
    hasOpenRouter: !offline && !!process.env.OPENROUTER_API_KEY,
    hasOllama: !!(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL),
    hasOllamaLocal
  });
});

app.get('/api/offline', (req, res) => {
  res.json({ offline: isOffline(), default: OFFLINE_DEFAULT });
});

app.post('/api/offline', (req, res) => {
  try {
    const body = req.body || {};
    const raw = body.offline;
    const value = typeof raw === 'boolean' ? raw : String(raw).toLowerCase() === 'true';
    setOffline(value);
    res.json({ offline: isOffline() });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

function buildProjectSystemPrompt() {
  return `You are a helpful school project assistant.
- Create a complete, student-friendly project writeup.
- Use clear structure and headings.
- Keep facts accurate and consistent with the provided sources.
- Include a references section with numbered citations like [1], [2] that map to the provided source URLs.
- Do not invent quotes, statistics, or sources.
- If information is missing, state that it is not available in the provided sources.`;
}

function buildAssignmentSystemPrompt() {
  return `You are a helpful teacher assistant creating student assignments.
- Produce a complete assignment handout based on the provided topic and sources.
- The output must be ready to copy/paste into a classroom LMS.
- Include clear sections, deliverables, and grading rubric.
- Keep facts accurate and consistent with the provided sources.
- Include a references section with numbered citations like [1], [2] that map to the provided source URLs.
- Do not invent quotes, statistics, or sources.
- If information is missing, state that it is not available in the provided sources.`;
}

function buildProjectUserPrompt({ topic, gradeLevel, projectType, wikiPack }) {
  const sourcesText = (wikiPack.sources || [])
    .slice(0, 10)
    .map((s) => `[${s.id}] ${s.title} - ${s.url}\nExcerpt: ${s.snippet || ''}`)
    .join('\n\n');

  return `Topic: ${topic}
Grade level: ${gradeLevel || 'high_school'}
Project type: ${projectType || 'report'}

Wikipedia summary (may be incomplete):
${wikiPack.summary || '(none)'}

Source list:
${sourcesText || '(no sources found)'}

Write a complete project with these sections:
1) Title
2) Abstract (4-6 sentences)
3) Introduction
4) Background / Key Concepts
5) Key Facts (bullet points)
6) Timeline (5-8 dated items if possible; if not possible, say so)
7) Important People / Organizations (if applicable)
8) Real-World Applications
9) Conclusion
10) Presentation Outline (8-12 slide titles + speaker notes)
11) References (URLs with the [n] numbers)

Formatting rules:
- Use plain text headings (no markdown #).
- Use blank lines between sections.
- Use citations [n] where needed.`;
}

function buildAssignmentUserPrompt({ topic, gradeLevel, projectType, wikiPack }) {
  const sourcesText = (wikiPack.sources || [])
    .slice(0, 10)
    .map((s) => `[${s.id}] ${s.title} - ${s.url}\nExcerpt: ${s.snippet || ''}`)
    .join('\n\n');

  return `Topic: ${topic}
Grade level: ${gradeLevel || 'high_school'}
Assignment type (if relevant): ${projectType || 'report'}

Background summary (may be incomplete):
${wikiPack.summary || '(none)'}

Source list:
${sourcesText || '(no sources found)'}

Create a complete assignment handout with these sections:
1) Assignment Title
2) Overview (4-7 sentences)
3) Learning Objectives (3-6 bullet points)
4) Required Background / Vocabulary (5-10 terms with simple definitions)
5) Task Instructions (step-by-step)
6) Deliverables (exact files/sections students must submit)
7) Formatting Requirements (length, font, citations, etc.)
8) Grading Rubric (criteria + point breakdown; totals 100 points)
9) Suggested Timeline (what to do each day/week)
10) Optional Extensions (for extra credit)
11) Academic Integrity / Allowed Tools
12) References (URLs with the [n] numbers)

Formatting rules:
- Use plain text headings (no markdown #).
- Use blank lines between sections.
- Use citations [n] where needed.`;
}

function buildProjectWithoutLLM({ topic, gradeLevel, projectType, wikiPack }) {
  const level = String(gradeLevel || 'high_school').toLowerCase();
  const type = String(projectType || 'report').toLowerCase();

  const title = `${topic} (${type.replace(/_/g, ' ')})`;
  const summary = String((wikiPack && wikiPack.summary) || '').trim();
  const sources = (wikiPack && Array.isArray(wikiPack.sources) ? wikiPack.sources : []).slice(0, 10);

  const factsFromSnippets = sources
    .map((s) => String(s.snippet || '').trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((t) => `- ${t}`)
    .join('\n');

  const references = sources
    .map((s) => `- [${s.id}] ${s.title} – ${s.url}`)
    .join('\n');

  const sentenceParts = summary
    ? (summary.match(/[^.!?]+[.!?]+(\s+|$)/g) || [summary])
    : [];
  const abstractLead = sentenceParts.length
    ? sentenceParts.slice(0, 4).join(' ').trim()
    : '';

  const abstract = abstractLead
    ? abstractLead
    : `This project introduces the topic "${topic}" and explains the main ideas in a clear, student-friendly way.`;

  const intro = summary
    ? summary
    : `This project explores "${topic}". It explains what the topic is, why it matters, and where it appears in real life.`;

  const background =
    summary
      ? `Key concepts are introduced using the following overview: ${summary}`
      : `Key concepts for "${topic}" are explained using reliable reference sources.`;

  const levelNote =
    level === 'middle_school'
      ? 'Written for middle school level: short sentences and simple vocabulary.'
      : level === 'college'
        ? 'Written for college level: more formal tone and clearer definitions.'
        : 'Written for high school level: clear explanations and organized structure.';

  return [
    'Title',
    title,
    '',
    'Abstract',
    `${abstract}\n\n${levelNote}`,
    '',
    'Introduction',
    intro,
    '',
    'Background / Key Concepts',
    background,
    '',
    'Key Facts',
    factsFromSnippets || '- No short fact snippets were available from the sources list.',
    '',
    'Timeline',
    'A dated timeline was not available from the provided summary/snippets. If you need a timeline, add a more specific topic like a historical event or invention.',
    '',
    'Important People / Organizations',
    'Not enough information was available in the provided sources to list specific people/organizations confidently.',
    '',
    'Real-World Applications',
    `Real-world applications depend on the exact angle of the topic. Use the sources [n] to identify real examples connected to "${topic}".`,
    '',
    'Conclusion',
    `In conclusion, "${topic}" can be understood by learning the key concepts and reviewing reliable sources. This project summarizes the topic and provides references for further reading.`,
    '',
    'Presentation Outline',
    'Slide 1: Title slide (topic + your name/class)',
    'Slide 2: What is the topic?',
    'Slide 3: Why it matters',
    'Slide 4: Key concepts',
    'Slide 5: Key facts',
    'Slide 6: Real-world examples',
    'Slide 7: Summary / conclusion',
    'Slide 8: References',
    '',
    'References',
    references || '- No sources found.'
  ].join('\n');
}

function buildAssignmentWithoutLLM({ topic, gradeLevel, projectType, wikiPack }) {
  const level = String(gradeLevel || 'high_school').toLowerCase();
  const type = String(projectType || 'assignment').toLowerCase();

  const sources = (wikiPack && Array.isArray(wikiPack.sources) ? wikiPack.sources : []).slice(0, 10);
  const summary = String((wikiPack && wikiPack.summary) || '').trim();
  const references = sources
    .map((s) => `- [${s.id}] ${s.title} – ${s.url}`)
    .join('\n');

  const levelNote =
    level === 'middle_school'
      ? 'Target level: middle school.'
      : level === 'college'
        ? 'Target level: college.'
        : 'Target level: high school.';

  const vocabCandidates = sources
    .map((s) => String(s.title || '').replace(/^wikipedia:\s*/i, '').trim())
    .filter(Boolean)
    .slice(0, 6);

  const vocab = vocabCandidates.length
    ? vocabCandidates.map((t) => `- ${t}: Define this term using sources [n].`).join('\n')
    : '- Key term: Define it using sources [n].';

  return [
    'Assignment Title',
    `${topic} (${type})`,
    '',
    'Overview',
    (summary || `In this assignment, you will research the topic "${topic}" using the provided sources and present what you learned in a clear format.`),
    '',
    'Learning Objectives',
    '- Explain the topic in your own words using evidence from sources [n].',
    '- Identify key ideas, terms, and real-world relevance.',
    '- Practice proper citation of sources.',
    '',
    'Required Background / Vocabulary',
    vocab,
    '',
    'Task Instructions',
    '1) Read at least 3 sources from the list [n].',
    '2) Take notes: definitions, key facts, and 2 real-world examples.',
    '3) Create your submission following the deliverables and formatting rules.',
    '4) Add citations [n] next to any factual claims you include.',
    '',
    'Deliverables',
    '- A written response (1–2 pages) with: introduction, key facts, and conclusion.',
    '- A references section listing the sources you used ([n] URLs).',
    '- (Optional) A small diagram or image with proper attribution.',
    '',
    'Formatting Requirements',
    `${levelNote}`,
    '- Use clear headings and paragraphs.',
    '- Include citations like [1] in the text and list them in References.',
    '',
    'Grading Rubric (100 points)',
    '- Understanding & accuracy (30)',
    '- Use of sources/citations (25)',
    '- Organization & clarity (20)',
    '- Vocabulary & key terms (15)',
    '- Mechanics (spelling/grammar) (10)',
    '',
    'Suggested Timeline',
    '- Day 1: Read sources + notes',
    '- Day 2: Draft',
    '- Day 3: Revise + finalize citations',
    '',
    'Optional Extensions',
    '- Create a 5-slide mini-presentation summarizing your findings.',
    '- Compare two viewpoints found in different sources.',
    '',
    'Academic Integrity / Allowed Tools',
    '- You may use the provided sources and class notes.',
    '- Do not copy-paste without quotation marks and citation.',
    '- If you use AI tools, you must follow your teacher’s policy and still provide citations.',
    '',
    'References',
    references || '- No sources found.'
  ].join('\n');
}

async function buildWebSources(topic, maxSources = 5) {
  const query = String(topic || '').trim();
  if (!query) return [];

  let results = await webSearch(query, { num: maxSources });
  if (!Array.isArray(results)) results = [];
  results = results.slice(0, maxSources);

  const pages = await Promise.all(results.map((r) => fetchAndExtract(r.url)));
  const sources = pages
    .map((p, idx) => {
      const fallback = results[idx] || {};
      const snippet = String(p.text || fallback.snippet || '').slice(0, 520).trim();
      return {
        id: 0,
        url: p.url || fallback.url,
        title: (p.title || fallback.title || p.url || fallback.url || '').trim(),
        snippet
      };
    })
    .filter((s) => s.url && s.title && s.snippet && s.snippet.length > 60)
    .slice(0, maxSources);

  // set ids later (caller may prepend wiki sources)
  return sources;
}

app.post('/api/project', async (req, res) => {
  try {
    if (isOffline()) {
      res.status(400).json({ error: 'OFFLINE_MODE is enabled. Disable offline mode to fetch web content and generate a project.' });
      return;
    }

    const body = req.body || {};
    const topic = String(body.topic || '').trim();
    if (!topic) {
      res.status(400).json({ error: 'topic is required' });
      return;
    }

    const rawMode = String(body.mode || 'project').trim().toLowerCase();
    const mode = rawMode === 'assignment' ? 'assignment' : 'project';

    const gradeLevel = String(body.gradeLevel || 'high_school').trim();
    const projectType = String(body.projectType || 'report').trim();

    let usedProvider = (body.provider || getProvider()).toString().toLowerCase();
    if (!usedProvider || usedProvider === 'none') {
      if (await probeLocalOllama(600)) {
        usedProvider = 'ollama';
      }
    }

    const wikiPack = await getWikipediaTopicPack(topic, { limit: 6 });
    const images = await searchWikimediaCommonsImages(topic, 8);

    const baseSources = [];
    if (wikiPack && wikiPack.pageUrl) {
      baseSources.push({
        id: 1,
        title: `Wikipedia: ${wikiPack.topTitle || topic}`,
        url: wikiPack.pageUrl,
        snippet: String(wikiPack.summary || '').slice(0, 520).trim()
      });
    }

    const webSources = await buildWebSources(topic, 5);
    const mergedSources = baseSources.concat(
      webSources.map((s, idx) => ({ ...s, id: baseSources.length + idx + 1 }))
    );

    // Re-use the existing prompt/fallback by injecting merged sources into wikiPack.sources
    const wikiPackForProject = {
      ...wikiPack,
      sources: mergedSources
    };

    if (!usedProvider || usedProvider === 'none') {
      const projectText =
        mode === 'assignment'
          ? buildAssignmentWithoutLLM({ topic, gradeLevel, projectType, wikiPack: wikiPackForProject })
          : buildProjectWithoutLLM({ topic, gradeLevel, projectType, wikiPack: wikiPackForProject });
      res.json({
        topic,
        mode,
        providerUsed: 'none',
        wiki: {
          topTitle: wikiPack.topTitle,
          summary: wikiPack.summary,
          pageUrl: wikiPack.pageUrl,
          sources: (wikiPack.sources || []).map(({ id, title, url }) => ({ id, title, url }))
        },
        sources: mergedSources,
        images,
        project: projectText
      });
      return;
    }

    const systemContent = mode === 'assignment' ? buildAssignmentSystemPrompt() : buildProjectSystemPrompt();
    const userContent =
      mode === 'assignment'
        ? buildAssignmentUserPrompt({ topic, gradeLevel, projectType, wikiPack: wikiPackForProject })
        : buildProjectUserPrompt({ topic, gradeLevel, projectType, wikiPack: wikiPackForProject });

    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent }
    ];

    const projectText = await chat(messages, { provider: usedProvider, temperature: 0.25 });

    res.json({
      topic,
      mode,
      providerUsed: usedProvider,
      wiki: {
        topTitle: wikiPack.topTitle,
        summary: wikiPack.summary,
        pageUrl: wikiPack.pageUrl,
        sources: (wikiPack.sources || []).map(({ id, title, url }) => ({ id, title, url }))
      },
      sources: mergedSources,
      images,
      project: projectText
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.listen(port, () => {
  console.log(`aas_41 running on http://localhost:${port}`);
});
