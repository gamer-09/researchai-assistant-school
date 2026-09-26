const { fetch } = require('undici');

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function wikipediaSearch(topic, limit = 5) {
  const q = String(topic || '').trim();
  if (!q) return [];

  const url =
    'https://en.wikipedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: q,
      srlimit: String(Math.min(Math.max(limit, 1), 10)),
      format: 'json',
      utf8: '1'
    }).toString();

  const resp = await fetch(url, { headers: { 'User-Agent': 'aas_41-school-project-bot/1.0 (+https://example.local)' } });
  if (!resp.ok) return [];
  const data = await resp.json();
  const items = data?.query?.search || [];
  return items
    .map((it) => ({
      title: it.title,
      snippet: stripHtml(it.snippet)
    }))
    .filter((x) => x && x.title);
}

async function wikipediaSummaryByTitle(title) {
  const t = String(title || '').trim();
  if (!t) return null;

  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t);
  const resp = await fetch(url, { headers: { 'User-Agent': 'aas_41-school-project-bot/1.0 (+https://example.local)' } });
  if (!resp.ok) return null;
  const data = await resp.json();
  return {
    title: data?.title || t,
    extract: String(data?.extract || '').trim(),
    pageUrl: data?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/\s+/g, '_'))}`,
    thumbnail: data?.thumbnail?.source || '',
    originalImage: data?.originalimage?.source || ''
  };
}

async function getWikipediaTopicPack(topic, { limit = 5 } = {}) {
  const results = await wikipediaSearch(topic, limit);
  const top = results[0];
  const summary = top ? await wikipediaSummaryByTitle(top.title) : null;

  return {
    query: String(topic || '').trim(),
    topTitle: summary?.title || (top && top.title) || '',
    summary: summary?.extract || '',
    pageUrl: summary?.pageUrl || '',
    thumbnail: summary?.thumbnail || '',
    sources: results.map((r, idx) => ({
      id: idx + 1,
      title: r.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(r.title || '').replace(/\s+/g, '_'))}`,
      snippet: r.snippet
    }))
  };
}

function extractMeta(meta, key) {
  if (!meta) return '';
  const v = meta[key] && meta[key].value;
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

async function searchWikimediaCommonsImages(topic, limit = 8) {
  const q = String(topic || '').trim();
  if (!q) return [];

  const url =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: q,
      gsrnamespace: '6',
      gsrlimit: String(Math.min(Math.max(limit, 1), 20)),
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '900',
      format: 'json',
      utf8: '1'
    }).toString();

  const resp = await fetch(url, { headers: { 'User-Agent': 'aas_41-school-project-bot/1.0 (+https://example.local)' } });
  if (!resp.ok) return [];
  const data = await resp.json();
  const pages = data?.query?.pages || {};

  const images = Object.values(pages)
    .map((p) => {
      const ii = p?.imageinfo && p.imageinfo[0];
      if (!ii) return null;
      const meta = ii.extmetadata || {};

      const descriptionUrl = ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(p.title || '').replace(/\s+/g, '_'))}`;
      const license = extractMeta(meta, 'LicenseShortName') || extractMeta(meta, 'UsageTerms');
      const artist = extractMeta(meta, 'Artist');
      const credit = extractMeta(meta, 'Credit') || extractMeta(meta, 'Attribution') || artist;
      const attributionRequired = extractMeta(meta, 'AttributionRequired');

      return {
        title: String(p.title || ''),
        url: String(ii.url || ''),
        thumbUrl: String(ii.thumburl || ii.url || ''),
        descriptionUrl,
        license,
        credit,
        attributionRequired
      };
    })
    .filter(Boolean);

  return images;
}

module.exports = {
  getWikipediaTopicPack,
  searchWikimediaCommonsImages
};
