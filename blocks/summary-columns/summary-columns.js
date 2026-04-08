/**
 * Completed result layout: left column MP4/WebM link becomes autoplay video; right column is copy.
 * Authored structure: .summary-columns > div > [ media col, copy col ].
 */
function injectVideoFromLink(mediaColumn) {
  const link = mediaColumn.querySelector('a[href*=".mp4"], a[href*=".webm"]');
  if (!link || !link.href) return;

  const video = document.createElement('video');
  video.src = link.href;
  video.className = 'summary-columns-video';
  video.setAttribute('playsinline', '');
  video.setAttribute('preload', 'metadata');
  video.setAttribute('muted', '');
  video.muted = true;
  video.loop = true;
  video.setAttribute('autoplay', '');
  const label = link.textContent?.trim();
  if (label && label.toLowerCase() !== 'video') {
    video.setAttribute('aria-label', label);
  } else {
    video.setAttribute('aria-label', 'Diagnostic result animation');
  }

  link.replaceWith(video);
  video.play().catch(() => {});
}

export default function init(el) {
  const row = el.querySelector(':scope > div');
  if (!row) return;

  row.classList.add('summary-columns-row');
  const columns = [...row.children];
  if (columns.length < 2) return;

  const [mediaCol, copyCol] = columns;
  mediaCol.classList.add('summary-columns-media');
  copyCol.classList.add('summary-columns-copy');

  injectVideoFromLink(mediaCol);

  const h1 = copyCol.querySelector('h1');
  if (h1) h1.classList.add('summary-columns-title');
  copyCol.querySelectorAll('h3').forEach((h) => h.classList.add('summary-columns-heading'));
}
