import DA_SDK from 'https://da.live/nx/utils/sdk.js';
//import { LitElement, html, nothing } from 'da-lit';
import { LitElement, html, nothing } from 'https://da.live/deps/lit/dist/index.js';

// Super Lite components
import 'https://da.live/nx/public/sl/components.js';

const sheet = new CSSStyleSheet();
const cssText = await fetch(new URL('./survey.css', import.meta.url)).then((r) => r.text());
sheet.replaceSync(cssText);

class Survey extends LitElement {
  static styles = sheet;

  static properties = {
    questions: { type: Array },
    _currentIndex: { state: true },
    _answers: { state: true },
    _selected: { state: true },
  };

  constructor() {
    super();
    this.questions = [];
    this._currentIndex = 0;
    this._answers = {};
    this._selected = null;
  }

  _selectOption(letter) {
    this._selected = letter;
  }

  _next() {
    if (!this._selected) return;
    const q = this.questions[this._currentIndex];
    this._answers = { ...this._answers, [q.ID]: this._selected };
    sessionStorage.setItem('survey-answers', JSON.stringify(this._answers));
    this._selected = null;
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
    sessionStorage.removeItem('survey-answers');
    this._answers = {};
    this._currentIndex = 0;
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
                class="option ${this._selected === letter ? 'selected' : ''}"
                @click=${() => this._selectOption(letter)}>
                ${q[`Option ${letter}`]}
              </button>
            `)}
          </div>
          <button class="next ${this._selected ? '' : 'disabled'}" @click=${this._next}>Next</button>
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