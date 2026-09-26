(() => {
  const el = {
    form: document.getElementById('projectForm'),
    topic: document.getElementById('topic'),
    mode: document.getElementById('mode'),
    gradeLevel: document.getElementById('gradeLevel'),
    projectType: document.getElementById('projectType'),
    provider: document.getElementById('provider'),
    runBtn: document.getElementById('runBtn'),
    status: document.getElementById('providerStatus'),
    offlineToggle: document.getElementById('offlineToggle'),
    terminal: document.getElementById('terminal'),
    output: document.getElementById('output'),
    gallery: document.getElementById('gallery'),
    copyProjectBtn: document.getElementById('copyProjectBtn'),
    downloadProjectBtn: document.getElementById('downloadProjectBtn'),
    clearBtn: document.getElementById('clearBtn')
  };

  let lastProjectText = '';

  function getMode() {
    const raw = el.mode && el.mode.value ? String(el.mode.value) : 'project';
    const m = raw.trim().toLowerCase();
    return m === 'assignment' ? 'assignment' : 'project';
  }

  function updateModeLabels() {
    const mode = getMode();
    if (el.runBtn) {
      el.runBtn.textContent = mode === 'assignment' ? 'Build Assignment' : 'Build Project';
    }
    if (el.copyProjectBtn) {
      el.copyProjectBtn.textContent = mode === 'assignment' ? 'Copy Assignment' : 'Copy Project';
    }
    if (el.downloadProjectBtn) {
      el.downloadProjectBtn.textContent = mode === 'assignment' ? 'Download Assignment' : 'Download Project';
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function linkifyToHTML(text) {
    const urlRe = /((https?:\/\/)[^\s<>'\"]+)/g;
    return escapeHtml(String(text || '')).replace(urlRe, (m) => {
      const href = m;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m)}</a>`;
    });
  }

  function scrollToBottom() {
    if (el.terminal) el.terminal.scrollTop = el.terminal.scrollHeight;
  }

  function clearOutput() {
    el.output.innerHTML = '';
    el.gallery.innerHTML = '';
    lastProjectText = '';
    el.copyProjectBtn.disabled = true;
    el.downloadProjectBtn.disabled = true;
  }

  function sectionTitle(text) {
    const div = document.createElement('div');
    div.className = 'section';
    div.textContent = text;
    el.output.appendChild(div);
    scrollToBottom();
    return div;
  }

  function line(text, cls) {
    const div = document.createElement('div');
    div.className = 'line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    el.output.appendChild(div);
    scrollToBottom();
    return div;
  }

  function renderSources(sources) {
    const wrap = document.createElement('div');
    wrap.className = 'sources';
    (sources || []).forEach((s) => {
      const row = document.createElement('div');
      row.className = 'source-row';
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = `[${s.id}]`;
      const a = document.createElement('a');
      a.textContent = s.title || s.url;
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      row.appendChild(badge);
      row.appendChild(a);
      wrap.appendChild(row);

      const snippet = String(s.snippet || '').trim();
      if (snippet) {
        const sn = document.createElement('div');
        sn.className = 'source-snippet';
        sn.textContent = snippet;
        wrap.appendChild(sn);
      }
    });
    el.output.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function renderProjectText(text) {
    const div = document.createElement('div');
    div.className = 'typewriter';
    div.innerHTML = linkifyToHTML(text);
    el.output.appendChild(div);
    scrollToBottom();
    return div;
  }

  async function copyToClipboard(text) {
    const t = String(text || '');
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch (_) {}

    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([String(text || '')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = String(filename || 'project.txt');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function renderImages(images) {
    el.gallery.innerHTML = '';
    (images || []).forEach((img) => {
      const card = document.createElement('div');
      card.className = 'img-card';

      const imageEl = document.createElement('img');
      imageEl.loading = 'lazy';
      imageEl.src = img.thumbUrl || img.url;
      imageEl.alt = img.title || 'image';

      const meta = document.createElement('div');
      meta.className = 'img-meta';

      const title = document.createElement('div');
      title.className = 'img-title';
      title.textContent = String(img.title || '').replace(/^File:/i, '').trim() || 'Image';

      const license = document.createElement('div');
      license.className = 'img-small';
      license.textContent = `License: ${img.license || 'Unknown'}`;

      const credit = document.createElement('div');
      credit.className = 'img-small';
      credit.textContent = `Credit: ${img.credit || 'Unknown'}`;

      const links = document.createElement('div');
      links.className = 'img-links';

      const aOpen = document.createElement('a');
      aOpen.href = img.descriptionUrl || img.url;
      aOpen.target = '_blank';
      aOpen.rel = 'noopener noreferrer';
      aOpen.textContent = 'Open';

      const aDirect = document.createElement('a');
      aDirect.href = img.url;
      aDirect.target = '_blank';
      aDirect.rel = 'noopener noreferrer';
      aDirect.textContent = 'Direct';

      links.appendChild(aOpen);
      links.appendChild(aDirect);

      meta.appendChild(title);
      meta.appendChild(license);
      meta.appendChild(credit);
      meta.appendChild(links);

      card.appendChild(imageEl);
      card.appendChild(meta);
      el.gallery.appendChild(card);
    });
  }

  async function detectProvider() {
    try {
      const res = await fetch('/api/providers');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const parts = [];
      parts.push(`provider=${data.provider}`);
      if (data.offline) parts.push('offline=on');
      if (data.hasOpenAI) parts.push('openai=on');
      if (data.hasOpenRouter) parts.push('openrouter=on');
      if (data.hasOllama) parts.push('ollama=on');
      el.status.textContent = 'Ready [' + parts.join(' ') + ']';
      if (el.offlineToggle) el.offlineToggle.checked = !!data.offline;
    } catch (_) {
      el.status.textContent = 'Provider detection failed';
    }
  }

  async function runProjectBuild() {
    const topic = (el.topic.value || '').trim();
    if (!topic) return;

    const mode = getMode();

    clearOutput();
    el.runBtn.disabled = true;

    line(`>> topic: ${topic}`);
    line(`>> mode: ${mode}`);
    line('>> searching + building…');

    try {
      const body = {
        topic,
        mode,
        gradeLevel: el.gradeLevel.value,
        projectType: el.projectType.value
      };
      if (el.provider.value) body.provider = el.provider.value;

      const res = await fetch('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${t}`);
      }

      const data = await res.json();

      sectionTitle('== search results ==');
      renderSources(Array.isArray(data.sources) ? data.sources : []);

      if (data.wiki && data.wiki.summary) {
        sectionTitle('== quick summary ==');
        renderProjectText(data.wiki.summary);
      }

      sectionTitle(mode === 'assignment' ? '== assignment ==' : '== project ==');
      lastProjectText = data.project || '';
      renderProjectText(lastProjectText || '(no project returned)');

      if (Array.isArray(data.images) && data.images.length) {
        sectionTitle('== images ==');
        renderImages(data.images);
      }

      el.copyProjectBtn.disabled = !lastProjectText;
      el.downloadProjectBtn.disabled = !lastProjectText;
      line('>> complete.');
    } catch (e) {
      line(`!! error: ${e.message || String(e)}`, 'error');
    } finally {
      el.runBtn.disabled = false;
    }
  }

  if (el.form) {
    el.form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      runProjectBuild();
    });
  }

  if (el.mode) {
    el.mode.addEventListener('change', () => {
      updateModeLabels();
    });
  }

  if (el.offlineToggle) {
    el.offlineToggle.addEventListener('change', async () => {
      const desired = !!el.offlineToggle.checked;
      try {
        const res = await fetch('/api/offline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offline: desired })
        });
        if (!res.ok) {
          el.status.textContent = 'Failed to toggle offline mode';
          return;
        }
        await detectProvider();
      } catch (_) {
        el.status.textContent = 'Failed to toggle offline mode';
      }
    });
  }

  if (el.copyProjectBtn) {
    el.copyProjectBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(lastProjectText);
      el.copyProjectBtn.textContent = ok ? 'Copied' : 'Copy Project';
      setTimeout(() => {
        updateModeLabels();
      }, 900);
    });
  }

  if (el.downloadProjectBtn) {
    el.downloadProjectBtn.addEventListener('click', () => {
      const namePart = (el.topic.value || 'project').trim().replace(/[^a-z0-9\-\s_]/gi, '').slice(0, 48) || 'project';
      const mode = getMode();
      const suffix = mode === 'assignment' ? 'assignment' : 'project';
      downloadTextFile(`${namePart}-${suffix}.txt`, lastProjectText);
    });
  }

  if (el.clearBtn) {
    el.clearBtn.addEventListener('click', () => {
      clearOutput();
    });
  }

  detectProvider();
  updateModeLabels();
})();

document.addEventListener('click', (e) => {
  const a = e.target && e.target.closest && e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (!href) return;
  if (href.startsWith('/') || href.startsWith('#')) return;
  if (/^https?:\/\//i.test(href)) {
    e.preventDefault();
    try { window.open(href, '_blank', 'noopener,noreferrer'); }
    catch (_) { window.location.href = href; }
  }
});
