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

    const h3 = document.createElement('h3');
    h3.className = 'data-tool-person-title';
    h3.textContent = personHeading(record, index);
    article.append(h3);

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

function recordsUrlForCompany(companyName) {
  const url = new URL(DATA_HOOK_URL);
  url.searchParams.set('company', companyName);
  return url.toString();
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
    p.textContent = 'No records returned for this company.';
    wrap.append(p);
    return wrap;
  }
  wrap.append(renderSurveyReport(records, questionsById));
  return wrap;
}

async function fetchAndRenderCompanyRecords(companyName, recordsMount) {
  recordsMount.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'data-tool-loading';
  loading.textContent = 'Loading records…';
  recordsMount.append(loading);

  try {
    const res = await fetch(recordsUrlForCompany(companyName));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const records = Array.isArray(data) ? data : data?.data;
    if (!Array.isArray(records)) throw new Error('Invalid records shape');

    recordsMount.replaceChildren(renderRecords(records, surveyQuestionsById));
  } catch {
    recordsMount.replaceChildren();
    const err = document.createElement('p');
    err.className = 'data-tool-error';
    err.setAttribute('role', 'alert');
    err.textContent = 'Could not load records for this company.';
    recordsMount.append(err);
  }
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

(async function init() {
  await customElements.whenDefined('sp-theme');

  const mount = document.getElementById('company-picker-mount');
  const recordsMount = document.getElementById('company-records-mount');
  if (!mount || !recordsMount) return;

  const hint = document.createElement('p');
  hint.className = 'data-tool-hint';
  hint.textContent = 'Select a company to load its records.';
  recordsMount.append(hint);

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

    mount.replaceChildren(buildCompanyPicker(items, recordsMount));
  } catch {
    const err = document.createElement('p');
    err.className = 'data-tool-error';
    err.setAttribute('role', 'alert');
    err.textContent = 'Could not load companies.';
    mount.replaceChildren(err);
  }
}());
