/**
 * Spectrum Web Components — theme + themes must load for tokens/CSS to apply.
 * @see https://opensource.adobe.com/spectrum-web-components/getting-started/
 */
import 'https://esm.sh/@spectrum-web-components/theme@1.11.2/sp-theme.js';
import 'https://esm.sh/@spectrum-web-components/theme@1.11.2/src/themes.js';
import 'https://esm.sh/@spectrum-web-components/picker@1.11.2/sync/sp-picker.js';
import 'https://esm.sh/@spectrum-web-components/field-label@1.11.2/sp-field-label.js';
import 'https://esm.sh/@spectrum-web-components/menu@1.11.2/sp-menu-item.js';

const DATA_HOOK_URL =
  'https://hook.fusion.adobe.com/ufdcr2tr7shhaedgogpwpoe1ce023b6x';
/** Same origin as the data tool page — resolves survey copy from the site root. */
const SURVEY_JSON_URL = '/survey.json';

/** Spinner + status text while Fusion / records requests are in flight. */
function createApiLoadingUI(message) {
  const wrap = document.createElement('div');
  wrap.className = 'data-tool-api-loading';
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  wrap.setAttribute('aria-busy', 'true');

  const spinner = document.createElement('span');
  spinner.className = 'data-tool-spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'data-tool-loading-label';
  label.textContent = message;

  wrap.append(spinner, label);
  return wrap;
}

/** @type {Map<string, object> | null} */
let surveyQuestionsById = null;

/** @returns {Promise<Map<string, object>>} */
async function loadSurveyDefinition() {
  const res = await fetch(SURVEY_JSON_URL);
  if (!res.ok) throw new Error(`Survey HTTP ${res.status}`);
  const json = await res.json();
  const data = Array.isArray(json?.data) ? json.data : [];
  const map = new Map();
  for (const q of data) {
    const id = String(q?.ID ?? '').trim();
    if (!id) continue;
    map.set(id, q);
  }
  return map;
}

function optionTextForLetter(question, letter) {
  if (!letter || !question) return '';
  const L = String(letter).trim().toUpperCase().charAt(0);
  if (!['A', 'B', 'C', 'D'].includes(L)) return String(letter);
  const key = `Option ${L}`;
  const text = question[key];
  return text != null && String(text).trim() !== '' ? String(text) : `(${L})`;
}

/**
 * API may return answers as an object or as a JSON string:
 * {"1":"A","2":"C",...} — keys are question IDs, values are option letters.
 * @param {unknown} raw
 * @returns {Record<string, unknown> | null}
 */
function parseAnswersBlob(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  return null;
}

/**
 * Collect answer letter per question ID from `answers` / `surveyAnswers` (object or JSON string)
 * or flat top-level keys matching question IDs.
 */
function collectAnswersFromRecord(record, questionsById) {
  const answers = new Map();

  const blobs = [
    parseAnswersBlob(record?.answers),
    parseAnswersBlob(record?.surveyAnswers),
  ].filter(Boolean);

  for (const nested of blobs) {
    for (const [k, v] of Object.entries(nested)) {
      const id = String(k).trim();
      if (!questionsById.has(id)) continue;
      const ch = String(v ?? '').trim().toUpperCase().charAt(0);
      if (['A', 'B', 'C', 'D'].includes(ch)) answers.set(id, ch);
    }
  }

  for (const id of questionsById.keys()) {
    if (answers.has(id)) continue;
    const raw = record?.[id];
    if (raw === undefined || raw === null || raw === '') continue;
    const ch = String(raw).trim().toUpperCase().charAt(0);
    if (['A', 'B', 'C', 'D'].includes(ch)) answers.set(id, ch);
  }
  return answers;
}

function personHeading(record, index) {
  const parts = [
    record?.email,
    record?.name,
    record?.userKey,
    record?.userId,
    record?.id,
  ].filter((v) => v != null && String(v).trim() !== '');
  if (parts.length) return String(parts[0]);
  return `Person ${index + 1}`;
}

/**
 * Human-facing name for listings (never prefers email — use with {@link recordEmailForDelete}).
 * @param {Record<string, unknown>} record
 * @param {number} index
 */
function recordDisplayNameForList(record, index) {
  if (!record || typeof record !== 'object') return `Person ${index + 1}`;

  const single =
    record.name ?? record.Name ?? record.fullName ?? record.displayName ?? record.displayname;
  if (single != null && String(single).trim() !== '') return String(single).trim();

  const fn =
    record.firstName ??
    record.firstname ??
    record.FirstName ??
    record.givenName ??
    record.givenname;
  const ln =
    record.lastName ??
    record.lastname ??
    record.LastName ??
    record.familyName ??
    record.familyname;
  const f = fn != null ? String(fn).trim() : '';
  const l = ln != null ? String(ln).trim() : '';
  const combined = [f, l].filter(Boolean).join(' ');
  if (combined) return combined;

  return `Person ${index + 1}`;
}

/** Keys to show as metadata (not question IDs, not raw answer blobs). */
function metadataEntries(record, questionsById) {
  const skip = new Set(['answers', 'surveyAnswers', ...questionsById.keys()]);
  const out = [];
  for (const [k, v] of Object.entries(record)) {
    if (skip.has(k)) continue;
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object' && !Array.isArray(v)) continue;
    out.push([k, formatMetadataValue(v)]);
  }
  return out;
}

function formatMetadataValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function renderSurveyReport(records, questionsById) {
  const wrap = document.createElement('div');
  wrap.className = 'data-tool-report';

  const sortedIds = [...questionsById.keys()].sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
  );

  records.forEach((record, index) => {
    const article = document.createElement('article');
    article.className = 'data-tool-person';

    const header = document.createElement('div');
    header.className = 'data-tool-person-header';

    const h3 = document.createElement('h3');
    h3.className = 'data-tool-person-title';
    h3.textContent = personHeading(record, index);
    header.append(h3);

    const deleteEmail = recordEmailForDelete(record);
    if (deleteEmail) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'data-tool-person-delete';
      delBtn.setAttribute(
        'aria-label',
        `Delete record for ${deleteEmail} from the database`,
      );
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async () => {
        if (
          !window.confirm(
            `Remove this person (${deleteEmail}) from the database? This cannot be undone.`,
          )
        ) {
          return;
        }
        delBtn.disabled = true;
        article.querySelector('.data-tool-person-delete-error')?.remove();
        try {
          const res = await fetch(recordsDeleteUrlForEmail(deleteEmail));
          const report = article.closest('.data-tool-report');
          if (!res.ok) {
            delBtn.disabled = false;
            const err = document.createElement('p');
            err.className = 'data-tool-person-delete-error';
            err.setAttribute('role', 'alert');
            err.textContent = `Delete failed (${res.status}).`;
            header.after(err);
            return;
          }
          article.remove();
          if (report && !report.querySelector('.data-tool-person')) {
            const empty = document.createElement('p');
            empty.className = 'data-tool-empty';
            empty.textContent = 'No records returned.';
            report.append(empty);
          }
        } catch {
          delBtn.disabled = false;
          const err = document.createElement('p');
          err.className = 'data-tool-person-delete-error';
          err.setAttribute('role', 'alert');
          err.textContent = 'Network error. Could not delete.';
          header.after(err);
        }
      });
      header.append(delBtn);
    }

    article.append(header);

    const meta = metadataEntries(record, questionsById);
    if (meta.length) {
      const dl = document.createElement('dl');
      dl.className = 'data-tool-person-meta';
      for (const [k, v] of meta) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        dl.append(dt, dd);
      }
      article.append(dl);
    }

    const answers = collectAnswersFromRecord(record, questionsById);
    const qTable = document.createElement('table');
    qTable.className = 'data-tool-q-table';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const thQ = document.createElement('th');
    thQ.scope = 'col';
    thQ.textContent = 'Question';
    const thA = document.createElement('th');
    thA.scope = 'col';
    thA.textContent = 'Selected option';
    hr.append(thQ, thA);
    thead.append(hr);

    const tbody = document.createElement('tbody');
    let anyRow = false;
    for (const id of sortedIds) {
      const q = questionsById.get(id);
      const questionText = String(q?.Question ?? '').trim();
      if (!questionText) continue;

      const letter = answers.get(id);
      const tr = document.createElement('tr');
      const tdQ = document.createElement('td');
      tdQ.textContent = questionText;
      const tdA = document.createElement('td');
      if (letter) {
        tdA.textContent = optionTextForLetter(q, letter);
      } else {
        tdA.className = 'data-tool-q-missing';
        tdA.textContent = '—';
      }
      tr.append(tdQ, tdA);
      tbody.append(tr);
      anyRow = true;
    }

    if (!anyRow) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.className = 'data-tool-empty';
      td.textContent = 'No mapped answers in this record.';
      tr.append(td);
      tbody.append(tr);
    }

    qTable.append(thead, tbody);
    article.append(qTable);
    wrap.append(article);
  });

  return wrap;
}

/** @returns {{ name: string, count: number }[]} sorted by name */
function countRecordsByCompany(rows) {
  const counts = new Map();
  for (const row of rows) {
    const c = row?.company;
    if (c == null || String(c).trim() === '') continue;
    const name = String(c).trim();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Records hook: `company` only, or `email` + `action=lookup` — never both company and email. */
function recordsUrlForCompany(companyName) {
  const url = new URL(DATA_HOOK_URL);
  url.search = '';
  url.searchParams.set('company', String(companyName).trim());
  return url.toString();
}

function recordsUrlForEmail(email) {
  const url = new URL(DATA_HOOK_URL);
  url.search = '';
  url.searchParams.set('email', String(email).trim());
  url.searchParams.set('action', 'lookup');
  return url.toString();
}

/** Delete row: only `email` and `action=delete` (same hook as lookups). */
function recordsDeleteUrlForEmail(email) {
  const url = new URL(DATA_HOOK_URL);
  url.search = '';
  url.searchParams.set('email', String(email).trim());
  url.searchParams.set('action', 'delete');
  return url.toString();
}

function recordEmailForDelete(record) {
  if (!record || typeof record !== 'object') return '';
  const raw = record.email ?? record.Email;
  if (raw == null || raw === '') return '';
  return String(raw).trim();
}

function renderRecords(records, questionsById) {
  const wrap = document.createElement('div');
  wrap.className = 'data-tool-records-wrap';
  if (!questionsById || questionsById.size === 0) {
    const p = document.createElement('p');
    p.className = 'data-tool-empty';
    p.textContent =
      'Survey definition not loaded. Check that /survey.json is available, then reload.';
    wrap.append(p);
    return wrap;
  }
  if (!Array.isArray(records) || records.length === 0) {
    const p = document.createElement('p');
    p.className = 'data-tool-empty';
    p.textContent = 'No records returned.';
    wrap.append(p);
    return wrap;
  }
  wrap.append(renderSurveyReport(records, questionsById));
  return wrap;
}

/** Keys that suggest the JSON root is one Fusion row (common for `?email=`). */
const RECORD_ROW_HINT_KEYS = new Set([
  'email',
  'company',
  'answers',
  'surveyAnswers',
  'firstname',
  'lastname',
  'firstName',
  'lastName',
  'country',
]);

/**
 * Normalize hook JSON to an array of rows. Email lookups often return
 * `{ data: { ...one row } }` instead of `{ data: [ ... ] }` or a bare array.
 * @param {unknown} data
 * @returns {unknown[]}
 */
function normalizeRecordsFromApiResponse(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data !== 'object') return [];

  const d = /** @type {Record<string, unknown>} */ (data);

  if (Array.isArray(d.data)) return d.data;
  if (d.data != null && typeof d.data === 'object' && !Array.isArray(d.data)) {
    return [d.data];
  }

  if (Array.isArray(d.records)) return d.records;
  if (
    d.records != null &&
    typeof d.records === 'object' &&
    !Array.isArray(d.records)
  ) {
    return [d.records];
  }

  if (Array.isArray(d.results)) return d.results;
  if (
    d.results != null &&
    typeof d.results === 'object' &&
    !Array.isArray(d.results)
  ) {
    return [d.results];
  }

  if (Object.keys(d).some((k) => RECORD_ROW_HINT_KEYS.has(k))) {
    return [d];
  }

  return [];
}

async function fetchAndRenderRecordsForUrl(url, recordsMount, errorMessage) {
  recordsMount.replaceChildren(createApiLoadingUI('Loading records…'));

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const records = normalizeRecordsFromApiResponse(data);

    recordsMount.replaceChildren(renderRecords(records, surveyQuestionsById));
  } catch {
    recordsMount.replaceChildren();
    const err = document.createElement('p');
    err.className = 'data-tool-error';
    err.setAttribute('role', 'alert');
    err.textContent = errorMessage;
    recordsMount.append(err);
  }
}

function fetchAndRenderCompanyRecords(companyName, recordsMount) {
  return fetchAndRenderRecordsForUrl(
    recordsUrlForCompany(companyName),
    recordsMount,
    'Could not load records for this company.',
  );
}

function fetchAndRenderEmailRecords(email, recordsMount) {
  return fetchAndRenderRecordsForUrl(
    recordsUrlForEmail(email),
    recordsMount,
    'Could not load records for this email address.',
  );
}

function buildCompanyPicker(items, recordsMount) {
  const label = document.createElement('sp-field-label');
  label.setAttribute('for', 'company-picker');
  label.textContent = 'Company';

  const picker = document.createElement('sp-picker');
  picker.id = 'company-picker';
  picker.setAttribute('placeholder', 'Select a company…');
  picker.setAttribute('size', 'm');

  for (const { name, count } of items) {
    const menuItem = document.createElement('sp-menu-item');
    menuItem.value = name;
    menuItem.textContent = `${name} (${count})`;
    picker.append(menuItem);
  }

  picker.addEventListener('change', () => {
    const name = picker.value;
    if (!name) return;
    fetchAndRenderCompanyRecords(name, recordsMount);
  });

  const field = document.createElement('div');
  field.className = 'data-tool-field';
  field.append(label, picker);
  return field;
}

function buildEmailLookup(recordsMount) {
  const field = document.createElement('div');
  field.className = 'data-tool-field';

  const label = document.createElement('label');
  label.className = 'data-tool-email-label';
  label.htmlFor = 'data-tool-email-input';
  label.textContent = 'Email address';

  const input = document.createElement('input');
  input.id = 'data-tool-email-input';
  input.type = 'email';
  input.name = 'email';
  input.setAttribute('autocomplete', 'email');
  input.setAttribute('inputmode', 'email');
  input.setAttribute('placeholder', 'name@example.com');
  input.className = 'data-tool-email-input';

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    fetchAndRenderEmailRecords(v, recordsMount);
  });

  field.append(label, input);
  return field;
}

function buildDataToolControls(items, recordsMount) {
  const root = document.createElement('div');
  root.className = 'data-tool-controls';
  root.append(buildCompanyPicker(items, recordsMount), buildEmailLookup(recordsMount));
  return root;
}

/**
 * Fetch records for a company name (Fusion hook `?company=` + CORS proxy fallbacks).
 * @param {string} companyName
 * @returns {Promise<unknown[]>}
 */
async function fetchCompanyRecordsForAnalyze(companyName) {
  const apiUrl = `${DATA_HOOK_URL}?company=${encodeURIComponent(companyName)}`;

  async function tryFetchArray(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  try {
    return await tryFetchArray(apiUrl);
  } catch {
    const proxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
      `https://corsproxy.io/?url=${encodeURIComponent(apiUrl)}`,
      `https://thingproxy.freeboard.io/fetch/${apiUrl}`,
    ];
    for (const proxyUrl of proxies) {
      try {
        return await tryFetchArray(proxyUrl);
      } catch {
        /* try next proxy */
      }
    }
    throw new Error('All proxies failed. The API may need CORS headers enabled.');
  }
}

function countriesFromRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return [];
  return [...new Set(records.map((r) => r?.country).filter(Boolean))];
}

/** Shown after a non-empty company lookup so the user can ask for a respondent list. */
function respondentsFollowUpQuestion(companyName) {
  return `\n\nWould you like to know who responded from ${companyName}? Reply yes to see each person’s name and email when we have both, or type another company to look up.`;
}

function buildLocalCompanySummary(records, companyName) {
  const count = Array.isArray(records) ? records.length : 0;
  if (count === 0) {
    return `I didn't find any records for "${companyName}". Try another company name or check spelling.`;
  }
  const countries = countriesFromRecords(records);
  const countryPhrase =
    countries.length > 0 ? ` Countries represented: ${countries.join(', ')}.` : '';
  return `I found ${count} record${count === 1 ? '' : 's'} for "${companyName}".${countryPhrase}${respondentsFollowUpQuestion(companyName)}`;
}

/**
 * @param {unknown[]} records
 * @returns {string}
 */
function formatRespondentsFromRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return "I don't have anyone to list for that lookup.";
  }
  const lines = records.map((r, index) => {
    const displayName = recordDisplayNameForList(r, index);
    const email = recordEmailForDelete(r);
    const generic = displayName === `Person ${index + 1}`;
    const nameDiffersFromEmail =
      email &&
      displayName.trim().toLowerCase() !== email.trim().toLowerCase();

    if (email && !generic && nameDiffersFromEmail) {
      return `• ${displayName} — ${email}`;
    }
    if (email) {
      return `• ${email}`;
    }
    return `• ${displayName}`;
  });
  return `Here’s who responded (name and email when available):\n${lines.join('\n')}`;
}

function isAffirmativeReply(text) {
  const t = String(text).trim().toLowerCase().replace(/[.!?]+$/u, '');
  if (t.length === 0) return false;
  if (t === 'y') return true;
  return /^(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|show me|tell me)(\s|$)/u.test(t);
}

function isNegativeReply(text) {
  const t = String(text).trim().toLowerCase().replace(/[.!?]+$/u, '');
  if (t.length === 0) return false;
  if (t === 'n') return true;
  return /^(no|nope|nah|no thanks|not now|don't|do not)(\s|$)/u.test(t);
}

function ensureRespondentsOfferInSummary(text, companyName, recordCount) {
  if (recordCount <= 0) return text;
  if (/who responded|names or emails|list.*respond/i.test(String(text))) return text;
  return `${String(text).trim()}${respondentsFollowUpQuestion(companyName)}`;
}

/**
 * Same request shape as the React sample. Browser CORS often blocks this; on failure we use
 * {@link buildLocalCompanySummary}. Optional: assign `window.__DATA_TOOL_ANTHROPIC_KEY__` (dev only).
 * @param {string} apiKey
 * @param {unknown[]} records
 * @param {string} companyName
 */
async function askClaudeForCompanySummary(apiKey, records, companyName) {
  const count = Array.isArray(records) ? records.length : 0;
  const countries = countriesFromRecords(records);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system:
        'You are a helpful assistant that summarizes company record data. Be concise and friendly. Only report what the data says. When there is at least one record, end by asking if the user would like to see who responded from that company (their name and email when available).',
      messages: [
        {
          role: 'user',
          content: `The API returned ${count} record(s) for the company "${companyName}".${
            count > 0 && countries.length > 0 ? ` Countries represented: ${countries.join(', ')}.` : ''
          } Please give a short, friendly summary${
            count > 0
              ? ', then ask if they want to see who responded (name and email for each person when the data includes both).'
              : '.'
          }`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const data = await res.json();
  const block = Array.isArray(data.content) ? data.content.find((b) => b.type === 'text') : null;
  const text = block && typeof block.text === 'string' ? block.text : '';
  return text.trim() !== '' ? text : 'No response from Claude.';
}

/**
 * @param {unknown[]} records
 * @param {string} companyName
 */
async function summarizeCompanyRecords(records, companyName) {
  const count = Array.isArray(records) ? records.length : 0;
  const rawKey =
    typeof window !== 'undefined'
      ? /** @type {{ __DATA_TOOL_ANTHROPIC_KEY__?: string }} */ (window).__DATA_TOOL_ANTHROPIC_KEY__
      : undefined;
  const apiKey = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (apiKey !== '') {
    try {
      const text = await askClaudeForCompanySummary(apiKey, records, companyName);
      return ensureRespondentsOfferInSummary(text, companyName, count);
    } catch {
      /* CORS, network, or invalid key — friendly local copy */
    }
  }
  return buildLocalCompanySummary(records, companyName);
}

function initAnalyzeDataModal() {
  const openBtn = document.getElementById('data-tool-analyze-open');
  const dialog = document.getElementById('data-tool-analyze-dialog');
  const closeBtn = dialog?.querySelector('.data-tool-modal-close');
  const body = document.getElementById('data-tool-analyze-body');
  if (!openBtn || !dialog || !closeBtn || !body) return;

  dialog.classList.add('data-tool-modal--analyze');

  const shell = document.createElement('div');
  shell.className = 'data-tool-analyze-shell';

  const messagesEl = document.createElement('div');
  messagesEl.className = 'data-tool-analyze-messages';
  messagesEl.setAttribute('role', 'log');
  messagesEl.setAttribute('aria-live', 'polite');
  messagesEl.setAttribute('aria-relevant', 'additions');

  const typingEl = document.createElement('div');
  typingEl.className = 'data-tool-analyze-typing';
  typingEl.setAttribute('aria-hidden', 'true');
  typingEl.hidden = true;
  typingEl.textContent = 'Looking up records...';

  const form = document.createElement('div');
  form.className = 'data-tool-analyze-form';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'data-tool-analyze-input';
  input.placeholder = 'Enter a company name (e.g. Adobe)...';
  input.setAttribute('autocomplete', 'organization');
  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'data-tool-analyze-send';
  sendBtn.textContent = 'Send';

  form.append(input, sendBtn);
  shell.append(messagesEl, typingEl, form);
  body.append(shell);

  /** @type {{ role: 'user' | 'assistant', text: string }[]} */
  let messages = [
    {
      role: 'assistant',
      text: 'Hi! I can look up how many records we have for a company. After each result, I can list respondents with name and email when we have both—just say yes when I ask.',
    },
  ];
  let loading = false;
  /** Last successful company lookup (for yes/no follow-up). */
  let lastAnalyzeRecords = /** @type {unknown[] | null} */ (null);
  let respondentsPromptActive = false;

  function syncChrome() {
    sendBtn.disabled = loading || !input.value.trim();
    input.disabled = loading;
  }

  function renderMessages() {
    messagesEl.replaceChildren();
    for (const m of messages) {
      const bubble = document.createElement('div');
      bubble.className = `data-tool-analyze-bubble data-tool-analyze-bubble--${m.role}`;
      bubble.textContent = m.text;
      messagesEl.append(bubble);
    }
    typingEl.hidden = !loading;
    messagesEl.scrollTop = messagesEl.scrollHeight;
    syncChrome();
  }

  async function handleSend() {
    const trimmed = input.value.trim();
    if (!trimmed || loading) return;
    messages = [...messages, { role: 'user', text: trimmed }];
    input.value = '';
    loading = true;
    renderMessages();

    try {
      if (
        respondentsPromptActive &&
        lastAnalyzeRecords &&
        Array.isArray(lastAnalyzeRecords) &&
        lastAnalyzeRecords.length > 0
      ) {
        if (isAffirmativeReply(trimmed)) {
          const listText = formatRespondentsFromRecords(lastAnalyzeRecords);
          messages = [...messages, { role: 'assistant', text: listText }];
          respondentsPromptActive = false;
          lastAnalyzeRecords = null;
        } else if (isNegativeReply(trimmed)) {
          messages = [
            ...messages,
            {
              role: 'assistant',
              text: 'No problem. Type another company name whenever you want a new lookup.',
            },
          ];
          respondentsPromptActive = false;
          lastAnalyzeRecords = null;
        } else {
          const records = await fetchCompanyRecordsForAnalyze(trimmed);
          const reply = await summarizeCompanyRecords(records, trimmed);
          messages = [...messages, { role: 'assistant', text: reply }];
          const n = Array.isArray(records) ? records.length : 0;
          if (n > 0) {
            lastAnalyzeRecords = records;
            respondentsPromptActive = true;
          } else {
            lastAnalyzeRecords = null;
            respondentsPromptActive = false;
          }
        }
      } else {
        const records = await fetchCompanyRecordsForAnalyze(trimmed);
        const reply = await summarizeCompanyRecords(records, trimmed);
        messages = [...messages, { role: 'assistant', text: reply }];
        const n = Array.isArray(records) ? records.length : 0;
        if (n > 0) {
          lastAnalyzeRecords = records;
          respondentsPromptActive = true;
        } else {
          lastAnalyzeRecords = null;
          respondentsPromptActive = false;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      messages = [...messages, { role: 'assistant', text: `Sorry, something went wrong: ${msg}` }];
      respondentsPromptActive = false;
      lastAnalyzeRecords = null;
    }

    loading = false;
    renderMessages();
  }

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !loading) {
      e.preventDefault();
      handleSend();
    }
  });
  input.addEventListener('input', syncChrome);

  renderMessages();

  openBtn.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
      requestAnimationFrame(() => {
        input.focus();
        messagesEl.scrollTop = messagesEl.scrollHeight;
      });
    }
  });

  closeBtn.addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

(async function init() {
  await customElements.whenDefined('sp-theme');

  initAnalyzeDataModal();

  const mount = document.getElementById('company-picker-mount');
  const recordsMount = document.getElementById('company-records-mount');
  if (!mount || !recordsMount) return;

  const hint = document.createElement('p');
  hint.className = 'data-tool-hint';
  hint.textContent =
    'Select a company, or type an email address and press Enter.';
  recordsMount.append(hint);

  mount.replaceChildren(createApiLoadingUI('Loading…'));

  try {
    surveyQuestionsById = await loadSurveyDefinition();
  } catch {
    surveyQuestionsById = null;
  }

  try {
    const res = await fetch(DATA_HOOK_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('Invalid response');

    const items = countRecordsByCompany(rows);

    mount.replaceChildren(buildDataToolControls(items, recordsMount));
  } catch {
    const err = document.createElement('p');
    err.className = 'data-tool-error';
    err.setAttribute('role', 'alert');
    err.textContent = 'Could not load companies.';
    mount.replaceChildren(err);
  }
}());
