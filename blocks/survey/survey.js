import { LitElement, html, nothing } from 'https://da.live/deps/lit/dist/index.js';

import 'https://da.live/nx/public/sl/components.js';

const SURVEY_ANSWERS_KEY = 'survey-answers';
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

class Survey extends LitElement {
  static styles = sheet;

  static properties = {
    questions: { type: Array },
    _currentIndex: { state: true },
    _answers: { state: true },
    _syncing: { state: true },
    _syncError: { state: true },
  };

  constructor() {
    super();
    this.questions = [];
    this._currentIndex = 0;
    this._answers = {};
    this._syncing = false;
    this._syncError = null;
  }

  updated(changed) {
    if (changed.has('questions') && this.questions.length > 0) {
      this._hydrateFromSessionStorage();
    }
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
    const options = ['A', 'B', 'C', 'D'];

    return html`
      <div class="survey">
        <div class="card">
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



export default async function init(el) {
  const questions = el.querySelector('a');
  questions.parentElement.parentElement.remove();
  const resp = await fetch(questions.href);
  if (!resp.ok) return;
  const json = await resp.json();
  
  const cmp = document.createElement('survey-questions');
  cmp.questions = json.data;
  el.append(cmp);
  
}