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
  };

  constructor() {
    super();
    this.questions = [];
    this._currentIndex = 0;
    this._answers = {};
  }

  _handleAnswer(q, value) {
    this._answers = { ...this._answers, [q.ID]: value };
    this._currentIndex += 1;
    sessionStorage.setItem('survey-answers', JSON.stringify(this._answers));
  }

  _renderSummary() {
    return html`
      <div class="survey">
        <h3 class="question-text">Survey Complete</h3>
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
        <p class="question-number">Question ${this._currentIndex + 1}</p>
        <h3 class="question-text">${q.Question}</h3>
        <div class="options-grid">
          ${options.map((letter) => html`
            <button class="option" @click=${() => this._handleAnswer(q, letter)}>
              <span class="option-letter">${letter}</span>
              <span class="option-text">${q[`Option ${letter}`]}</span>
            </button>
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