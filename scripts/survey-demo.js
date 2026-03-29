/**
 * Survey demo page: start screen → intake form → survey (stacked + crossfade).
 * Matches STORAGE_KEY in blocks/form/form.js (sessionStorage)
 */
const STORAGE_KEY = 'intake-form-data';
/** Set when the user clicks through from `.section.start-screen` (e.g. "Start Quiz"). */
const STARTED_KEY = 'survey-demo-started';

/** Keep in sync with scripts.js (survey demo runs on `/` and `/survey-demo`). */
function isSurveyDemoPath() {
  const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  return path === '/' || path === '/survey-demo';
}

function getStartScreenSection() {
  return document.querySelector('main .section.start-screen');
}

/**
 * Form/survey UIs live in Lit shadow roots — do not rely on `main .survey` or form layout classes.
 * Prefer decorated blocks (`data-block-name`) after loadArea().
 */
function getSections() {
  const formSection =
    document.querySelector('main [data-block-name="form"]')?.closest('.section') ??
    document.querySelector('main .section.intake-form') ??
    document.querySelector('main .intake-form')?.closest('.section');

  const surveySection =
    document.querySelector('main [data-block-name="survey"]')?.closest('.section') ??
    document.querySelector('main survey-questions')?.closest('.section') ??
    document.querySelector('main .section.survey');

  return { startScreenSection: getStartScreenSection(), formSection, surveySection };
}

function hasIntakeData() {
  try {
    return Boolean(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

function hasPassedStartScreen() {
  try {
    return sessionStorage.getItem(STARTED_KEY) === '1';
  } catch {
    return false;
  }
}

function syncVisibility(startScreenSection, formSection, surveySection) {
  const showSurvey = hasIntakeData();
  const hasStart = Boolean(startScreenSection);
  const passedStart = !hasStart || hasPassedStartScreen();
  const showForm = !showSurvey && passedStart;
  const showStart = !showSurvey && hasStart && !passedStart;

  document.body.classList.toggle('survey-demo--show-survey', showSurvey);
  document.body.classList.toggle('survey-demo--show-form', showForm);
  document.body.classList.toggle('survey-demo--show-start', showStart);
}

export default function initSurveyDemoPage() {
  if (!isSurveyDemoPath()) return;

  const { startScreenSection, formSection, surveySection } = getSections();
  if (!formSection || !surveySection) return;

  formSection.classList.add('intake-form');
  surveySection.classList.add('survey');

  document.body.classList.add('survey-demo-page');

  const sync = () => syncVisibility(startScreenSection, formSection, surveySection);
  sync();

  if (startScreenSection) {
    startScreenSection.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a || !startScreenSection.contains(a)) return;
      e.preventDefault();
      try {
        sessionStorage.setItem(STARTED_KEY, '1');
      } catch {
        /* ignore */
      }
      sync();
    });
  }

  document.addEventListener('form-submit', sync);
}
