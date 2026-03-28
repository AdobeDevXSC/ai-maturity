const INTAKE_SPARKLE_VIDEO_URL =
  'https://publish-p124903-e1367755.adobeaemcloud.com/content/dam/ai-assessment/sparkle%20animation%20op4.mp4';

/**
 * Inserts autoplaying sparkle video into each intake form section (once).
 */
export default function injectIntakeFormVideo() {
  let added = false;
  for (const section of document.querySelectorAll('main .section.intake-form')) {
    if (section.querySelector('.intake-form-video-wrap')) continue;

    const wrap = document.createElement('div');
    wrap.className = 'intake-form-video-wrap';
    wrap.setAttribute('aria-hidden', 'true');

    const video = document.createElement('video');
    video.className = 'intake-form-video';
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('loop', '');
    video.muted = true;

    const source = document.createElement('source');
    source.src = INTAKE_SPARKLE_VIDEO_URL;
    source.type = 'video/mp4';
    video.append(source);

    wrap.append(video);
    section.prepend(wrap);

    video.play().catch(() => {});
    added = true;
  }
  if (added) {
    document.body.classList.add('intake-form-page-video');
  }
}
