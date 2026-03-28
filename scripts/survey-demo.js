/**
 * Survey demo page: show intake form or survey section (not both), full viewport.
 * Matches STORAGE_KEY in blocks/form/form.js (sessionStorage)
 */
const STORAGE_KEY = 'intake-form-data';

function isSurveyDemoPath() {
  const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  return /(^|\/)survey-demo$/.test(path);
}

function getSections() {
  const formSection = document.querySelector('main .intake-form')?.closest('.section');
  const surveySection = document.querySelector('main .survey')?.closest('.section');
  return { formSection, surveySection };
}

function hasIntakeData() {
  try {
    return Boolean(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

function syncVisibility(formSection, surveySection) {
  const showSurvey = hasIntakeData();
  document.body.classList.toggle('survey-demo--show-form', !showSurvey);
  document.body.classList.toggle('survey-demo--show-survey', showSurvey);
}

export default function initSurveyDemoPage() {
  if (!isSurveyDemoPath()) return;

  const { formSection, surveySection } = getSections();
  if (!formSection || !surveySection) return;

  formSection.classList.add('intake-form');
  surveySection.classList.add('survey');

  document.body.classList.add('survey-demo-page');

  const sync = () => syncVisibility(formSection, surveySection);
  sync();

  document.addEventListener('form-submit', sync);
}
