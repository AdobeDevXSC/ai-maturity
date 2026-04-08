import { LitElement, html, nothing } from 'https://da.live/deps/lit/dist/index.js';

import 'https://da.live/nx/public/sl/components.js';

const SURVEY_ANSWERS_KEY = 'survey-answers';
/** Running totals by question `Category` (JSON object), derived from answers + score sheet. */
const SURVEY_CATEGORY_SCORES_KEY = 'survey-scores-by-category';
/** Same key as blocks/form/form.js — intake payload `{ submittedAt, data }` */
const INTAKE_FORM_STORAGE_KEY = 'intake-form-data';
const SURVEY_HOOK_URL =
  'https://hook.fusion.adobe.com/v64d1uyfggdtifqtn2xpp3y2588qpxd7';

function getIntakeEmail() {
  try {
    const raw = sessionStorage.getItem(INTAKE_FORM_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    const email = parsed?.data?.email;
    return typeof email === 'string' ? email : '';
  } catch {
    return '';
  }
}

const sheet = new CSSStyleSheet();
const cssText = await fetch(new URL('./survey.css', import.meta.url)).then((r) => r.text());
sheet.replaceSync(cssText);

/** Legacy: `json.data` is the questions array. Multi-sheet: `json.data.data`. */
function normalizeQuestionsArray(json) {
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.data)) return json.data.data;
  return [];
}

/** Build A–D point values from `json.score.data` rows (`Option`, `Score`). */
function buildOptionScoresMap(scoreSheetRows) {
  const out = { A: 0, B: 0, C: 0, D: 0 };
  if (!Array.isArray(scoreSheetRows)) return out;
  for (const row of scoreSheetRows) {
    const opt = String(row?.Option ?? row?.option ?? '')
      .trim()
      .toUpperCase()
      .charAt(0);
    if (!['A', 'B', 'C', 'D'].includes(opt)) continue;
    const raw = row?.Score ?? row?.score;
    const n = Number(raw);
    out[opt] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

class Survey extends LitElement {
  static styles = sheet;

  static properties = {
    questions: { type: Array },
    /** Points per option letter from survey score sheet */
    optionScores: { type: Object },
    _currentIndex: { state: true },
    _answers: { state: true },
    _syncing: { state: true },
    _syncError: { state: true },
  };

  constructor() {
    super();
    this.questions = [];
    this.optionScores = { A: 0, B: 0, C: 0, D: 0 };
    this._currentIndex = 0;
    this._answers = {};
    this._syncing = false;
    this._syncError = null;
    /** When true, next `updated` after index change replays `.question-pane` enter animation. */
    this._animateNextQuestion = false;
  }

  updated(changed) {
    if (changed.has('questions') && this.questions.length > 0) {
      this._hydrateFromSessionStorage();
    }
    if (changed.has('_currentIndex') && this._animateNextQuestion) {
      this._animateNextQuestion = false;
      if (this._currentIndex < this.questions.length) {
        requestAnimationFrame(() => this._replayQuestionPaneAnimation());
      }
    }
  }

  _replayQuestionPaneAnimation() {
    const pane = this.renderRoot?.querySelector('.question-pane');
    if (!pane) return;
    pane.style.animation = 'none';
    void pane.offsetHeight;
    pane.style.animation = '';
  }

  _readStoredAnswers() {
    try {
      const raw = sessionStorage.getItem(SURVEY_ANSWERS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * POST { email, answers } to Fusion hook, then persist survey-answers to sessionStorage.
   * @returns {Promise<boolean>}
   */
  async _postAndPersistAnswers(nextAnswers) {
    const email = getIntakeEmail();
    try {
      const res = await fetch(SURVEY_HOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, answers: nextAnswers }),
      });
      if (!res.ok) return false;
      try {
        sessionStorage.setItem(SURVEY_ANSWERS_KEY, JSON.stringify(nextAnswers));
        this._persistCategoryScores(nextAnswers);
      } catch {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** First question index without an answer, or questions.length if all answered. */
  _indexFromStoredAnswers(answers) {
    for (let i = 0; i < this.questions.length; i++) {
      const id = this.questions[i].ID;
      if (answers[id] === undefined || answers[id] === null || answers[id] === '') {
        return i;
      }
    }
    return this.questions.length;
  }

  _hydrateFromSessionStorage() {
    const stored = this._readStoredAnswers();
    this._answers = { ...stored };
    this._currentIndex = this._indexFromStoredAnswers(this._answers);
    this._persistCategoryScores(this._answers);
  }

  /**
   * @param {Record<string, unknown>} answers
   * @returns {Record<string, number>}
   */
  _computeCategoryScores(answers) {
    const totals = /** @type {Record<string, number>} */ ({});
    const scores = this.optionScores ?? { A: 0, B: 0, C: 0, D: 0 };
    for (const q of this.questions) {
      const id = String(q?.ID ?? '').trim();
      if (!id) continue;
      const letter = String(answers[id] ?? '')
        .trim()
        .toUpperCase()
        .charAt(0);
      if (!['A', 'B', 'C', 'D'].includes(letter)) continue;
      const catRaw = String(q?.Category ?? 'Uncategorized').trim();
      const cat = catRaw || 'Uncategorized';
      const pts = scores[letter] ?? 0;
      totals[cat] = (totals[cat] ?? 0) + pts;
    }
    return totals;
  }

  /** @param {Record<string, unknown>} answers */
  _persistCategoryScores(answers) {
    try {
      const totals = this._computeCategoryScores(answers);
      sessionStorage.setItem(SURVEY_CATEGORY_SCORES_KEY, JSON.stringify(totals));
    } catch {
      /* ignore quota / private mode */
    }
  }

  async _selectOption(letter) {
    if (this._syncing) return;
    const q = this.questions[this._currentIndex];
    if (!q) return;
    const nextAnswers = { ...this._answers, [q.ID]: letter };
    this._syncError = null;
    this._syncing = true;
    const ok = await this._postAndPersistAnswers(nextAnswers);
    this._syncing = false;
    if (ok) {
      this._answers = nextAnswers;
    } else {
      this._syncError = 'Could not save your answer. Please try again.';
    }
  }

  _next() {
    const q = this.questions[this._currentIndex];
    if (!q || !this._answers[q.ID]) return;
    this._animateNextQuestion = true;
    this._currentIndex += 1;
  }

  _getCirclePosition() {
    const scoreMap = { A: 0, B: 1, C: 2, D: 3 };
    const ids = this.questions.map((q) => q.ID);
    const xScore = scoreMap[this._answers[ids[0]]] ?? 0;
    const yScore = scoreMap[this._answers[ids[1]]] ?? 0;
    const stops = [12, 37, 63, 88];
    return { x: stops[xScore], y: stops[3 - yScore] };
  }

  _renderSummary() {
    const pos = this._getCirclePosition();
    return html`
      <div class="survey summary-page">
        <div class="summary-columns">
          <div class="summary-left">
            <div class="chart-container">
              <img src="https://main--ai-maturity--adobedevxsc.aem.page/media/media_1bbd8ce6a9540084ac594dce2bf02286e57ccab33.png" alt="" class="summary-image" />
              <span class="chart-marker" style="left:${pos.x}%;top:${pos.y}%"></span>
            </div>
          </div>
          <div class="summary-right">
            <h3 class="summary-title">Survey Complete</h3>
            <div class="summary">
              ${this.questions.map((q) => {
                const letter = this._answers[q.ID];
                return html`
                  <div class="summary-item">
                    <p class="summary-question">${q.Question}</p>
                    <p class="summary-answer"><strong>${letter}:</strong> ${q[`Option ${letter}`]}</p>
                  </div>
                `;
              })}
            </div>
            <button class="retake" @click=${this._retake}>Take Survey Again</button>
          </div>
        </div>
      </div>
    `;
  }

  _retake() {
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    window.location.reload();
  }

  render() {
    if (!this.questions.length) return nothing;

    if (this._currentIndex >= this.questions.length) {
      return this._renderSummary();
    }

    const q = this.questions[this._currentIndex];
    if (!q) {
      return this._renderSummary();
    }

    const options = ['A', 'B', 'C', 'D'];

    return html`
      <div class="survey">
        <div class="card">
          <div class="question-pane">
            <h3 class="question-text">${q.Question}</h3>
            <div class="options-grid">
              ${options.map((letter) => html`
                <button
                  type="button"
                  class="option ${this._answers[q.ID] === letter ? 'selected' : ''}"
                  ?disabled=${this._syncing}
                  @click=${() => this._selectOption(letter)}>
                  ${q[`Option ${letter}`]}
                </button>
              `)}
            </div>
            <button class="next ${this._answers[q.ID] && !this._syncing ? '' : 'disabled'}" @click=${this._next}>
              Next
            </button>
            ${this._syncError
              ? html`<p class="survey-sync-error">${this._syncError}</p>`
              : nothing}
          </div>
        </div>
        <div class="dots">
          ${this.questions.map((_, i) => html`
            <span class="dot ${i === this._currentIndex ? 'active' : ''} ${i < this._currentIndex ? 'completed' : ''}"></span>
          `)}
        </div>
      </div>
    `;
  }
}

customElements.define('survey-questions', Survey);

/** Drop trailing/empty sheet rows so we never show a blank 2×2 (ghost “question 11”). */
function isValidSurveyQuestion(q) {
  if (!q || typeof q !== 'object') return false;
  if (!String(q.Question ?? '').trim()) return false;
  if (String(q.ID ?? '').trim() === '') return false;
  return ['A', 'B', 'C', 'D'].some(
    (L) => String(q[`Option ${L}`] ?? '').trim() !== '',
  );
}

export default async function init(el) {
  const questions = el.querySelector('a');
  questions.parentElement.parentElement.remove();
  const resp = await fetch(questions.href);
  if (!resp.ok) return;
  const json = await resp.json();

  const raw = normalizeQuestionsArray(json);
  const filtered = raw.filter(isValidSurveyQuestion);
  const optionScores = buildOptionScoresMap(json.score?.data);

  const cmp = document.createElement('survey-questions');
  cmp.questions = filtered;
  cmp.optionScores = optionScores;
  el.append(cmp);
}