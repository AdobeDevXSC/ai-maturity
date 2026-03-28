import { LitElement, html, nothing } from 'https://da.live/deps/lit/dist/index.js';

import 'https://da.live/nx/public/sl/components.js';

const sheet = new CSSStyleSheet();
const cssText = await fetch(new URL('./form.css', import.meta.url)).then((r) => r.text());
sheet.replaceSync(cssText);

const DEFAULT_JSON_URL = 'http://localhost:3000/intake-form.json';
const STORAGE_KEY = 'intake-form-data';
const INTAKE_SUBMIT_HOOK_URL =
  'https://hook.fusion.adobe.com/v64d1uyfggdtifqtn2xpp3y2588qpxd7';

/**
 * Reads Fusion hook response: JSON object with key/userKey/user_key/id, JSON string, or plain text.
 */
async function readUserKeyFromResponse(res) {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const k = parsed.key ?? parsed.userKey ?? parsed.user_key ?? parsed.id;
      if (k !== undefined && k !== null && k !== '') return String(k);
      return undefined;
    }
  } catch {
    return trimmed;
  }
  return undefined;
}

function normType(t) {
  return String(t || '').trim().toLowerCase();
}

function isMandatory(field) {
  return String(field.Mandatory).toLowerCase() === 'true';
}

/** Group fields into rows for intake layout (matches typical sheet order). */
function partitionIntakeFields(fields) {
  const submit = fields.find((f) => normType(f.Type) === 'submit');
  const nonSubmit = fields.filter((f) => normType(f.Type) !== 'submit');
  const row1Keys = ['firstName', 'lastName', 'country'];
  const row2Keys = ['company', 'email'];
  const row1 = row1Keys.map((k) => nonSubmit.find((f) => f.Name === k)).filter(Boolean);
  const row2 = row2Keys.map((k) => nonSubmit.find((f) => f.Name === k)).filter(Boolean);
  const inRows = new Set([...row1, ...row2].map((f) => f.Name));
  const remainder = nonSubmit.filter((f) => !inRows.has(f.Name));
  if (row1.length >= 3 && row2.length >= 2) {
    return { row1, row2, remainder, submit };
  }
  const r = nonSubmit;
  return {
    row1: r.slice(0, 3),
    row2: r.slice(3, 5),
    remainder: r.slice(5),
    submit,
  };
}

class FormCmp extends LitElement {
  static styles = sheet;

  static properties = {
    fields: { type: Array },
    _values: { state: true },
    _status: { state: true },
    _submitting: { state: true },
  };

  constructor() {
    super();
    this.fields = [];
    this._values = {};
    this._status = null;
    this._submitting = false;
  }

  updated(changed) {
    if (changed.has('fields')) {
      const next = { ...this._values };
      for (const f of this.fields) {
        const t = normType(f.Type);
        if (t === 'submit') continue;
        const name = f.Name;
        if (next[name] === undefined) {
          if (t === 'checkbox') next[name] = false;
          else next[name] = '';
        }
      }
      this._values = next;
    }
  }

  _onInput(name, value) {
    this._values = { ...this._values, [name]: value };
    this._status = null;
  }

  _onCheckbox(name, checked) {
    this._values = { ...this._values, [name]: checked };
    this._status = null;
  }

  async _onSubmit(e) {
    e.preventDefault();
    if (this._submitting) return;

    const data = {};
    for (const f of this.fields) {
      const t = normType(f.Type);
      if (t === 'submit') continue;
      const name = f.Name;
      if (isMandatory(f)) {
        const v = this._values[name];
        const empty =
          v === '' || v === undefined || v === null || (t === 'checkbox' && v === false);
        if (empty) {
          this._status = {
            type: 'error',
            message: `Please complete: ${f.Label.replace(/\s*\*$/, '')}`,
          };
          return;
        }
      }
      data[name] = this._values[name];
    }

    const payload = { submittedAt: new Date().toISOString(), data };

    this._submitting = true;
    this._status = null;

    try {
      const res = await fetch(INTAKE_SUBMIT_HOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        this._status = {
          type: 'error',
          message: `Submission failed (${res.status}). Please try again.`,
        };
        return;
      }

      const userKey = await readUserKeyFromResponse(res);
      const storedPayload = { ...payload };
      if (userKey !== undefined) {
        storedPayload.userKey = userKey;
      }

      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedPayload));
      } catch (err) {
        this._status = {
          type: 'error',
          message: 'Submitted, but could not save in this session. Storage may be disabled.',
        };
        return;
      }

      this._status = { type: 'ok', message: 'Your answers have been saved.' };
      this.dispatchEvent(
        new CustomEvent('form-submit', {
          bubbles: true,
          composed: true,
          detail: { data, storageKey: STORAGE_KEY, payload: storedPayload },
        }),
      );
    } catch (err) {
      this._status = {
        type: 'error',
        message: 'Network error. Check your connection and try again.',
      };
    } finally {
      this._submitting = false;
    }
  }

  _renderField(f) {
    const t = normType(f.Type);
    const name = f.Name;
    const id = name;
    const req = isMandatory(f);
    const ph = f.Placeholder || '';
    const extraClass = f.Customclass || '';

    if (t === 'submit') {
      return html`
        <button type="submit" class="form-submit ${extraClass}" ?disabled=${this._submitting}>
          ${this._submitting ? 'Sending…' : f.Label}
        </button>
      `;
    }

    if (t === 'checkbox') {
      return html`
        <div class="field field-checkbox ${extraClass}">
          <label class="checkbox-label">
            <input
              type="checkbox"
              name=${name}
              id=${id}
              .checked=${!!this._values[name]}
              @change=${(e) => this._onCheckbox(name, e.target.checked)}
            />
            <span>${f.Label}</span>
          </label>
        </div>
      `;
    }

    if (t === 'select') {
      const options = String(f.Options || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return html`
        <div class="field ${extraClass}">
          <label class="field-label" for=${id}>${f.Label}</label>
          <select
            name=${name}
            id=${id}
            required=${req}
            @change=${(e) => this._onInput(name, e.target.value)}
          >
            <option value="" disabled ?selected=${!this._values[name]}>${ph || 'Select…'}</option>
            ${options.map(
              (opt) => html`
                <option value=${opt} ?selected=${this._values[name] === opt}>${opt}</option>
              `,
            )}
          </select>
        </div>
      `;
    }

    const inputType = t === 'email' ? 'email' : 'text';
    return html`
      <div class="field ${extraClass}">
        <label class="field-label" for=${id}>${f.Label}</label>
        <input
          type=${inputType}
          name=${name}
          id=${id}
          placeholder=${ph}
          required=${req}
          .value=${this._values[name] ?? ''}
          @input=${(e) => this._onInput(name, e.target.value)}
        />
      </div>
    `;
  }

  render() {
    if (!this.fields.length) return nothing;

    const { row1, row2, remainder, submit } = partitionIntakeFields(this.fields);

    return html`
      <div class="form-wrap form-wrap--intake">
        <form class="dynamic-form intake-form-layout" @submit=${this._onSubmit}>
          <div class="intake-row intake-row--3">
            ${row1.map((f) => this._renderField(f))}
          </div>
          <div class="intake-row intake-row--split">
            ${row2.map((f) => this._renderField(f))}
          </div>
          ${remainder.map((f) => this._renderField(f))}
          <div class="intake-actions">
            ${submit ? this._renderField(submit) : nothing}
          </div>
          ${this._status
            ? html`<p class="form-status ${this._status.type}">${this._status.message}</p>`
            : nothing}
        </form>
      </div>
    `;
  }
}

customElements.define('form-cmp', FormCmp);

export default async function init(el) {
  const link = el.querySelector('a');
  const url = link?.href ?? DEFAULT_JSON_URL;
  if (link?.parentElement?.parentElement) {
    link.parentElement.parentElement.remove();
  }

  const resp = await fetch(url);
  if (!resp.ok) return;

  const json = await resp.json();
  const rows = Array.isArray(json.data) ? json.data : [];

  const cmp = document.createElement('form-cmp');
  cmp.fields = rows;
  el.append(cmp);
}