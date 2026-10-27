import { useEffect } from 'react';

const ACTIVE_MODAL_SELECTOR = [
  '.modal.show',
  '.modal[aria-modal="true"]',
  '.MuiModal-root',
  '[role="dialog"][aria-modal="true"]',
].join(',');

export function cleanupOrphanedModalArtifacts(doc = document) {
  // React-Bootstrap mounts `.modal` before adding `.show` while opening, and
  // removes `.show` before unmounting while closing. Treat the mounted modal
  // as the owner for that entire transition so we never tear down its body
  // lock or backdrop mid-animation.
  const bootstrapModalMounted = Boolean(doc.querySelector('.modal'));
  if (bootstrapModalMounted) return false;

  const backdrops = Array.from(doc.querySelectorAll('.modal-backdrop'));
  const body = doc.body;
  const hasBootstrapLock = body.classList.contains('modal-open') || body.hasAttribute('data-rr-ui-modal-open');
  if (!backdrops.length && !hasBootstrapLock) return false;

  backdrops.forEach(backdrop => backdrop.remove());
  body.classList.remove('modal-open');
  body.removeAttribute('data-rr-ui-modal-open');

  // Bootstrap writes these inline while locking the page. Do not disturb a
  // different dialog system if it still owns the document scroll lock.
  if (!doc.querySelector(ACTIVE_MODAL_SELECTOR)) {
    body.style.removeProperty('overflow');
    body.style.removeProperty('padding-right');
  }
  return true;
}

export default function ModalInteractionGuard() {
  useEffect(() => {
    let cleanupTimer;
    const scheduleCleanup = () => {
      window.clearTimeout(cleanupTimer);
      cleanupTimer = window.setTimeout(() => cleanupOrphanedModalArtifacts(), 80);
    };
    const observer = new MutationObserver(scheduleCleanup);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-modal'],
    });
    scheduleCleanup();
    return () => {
      observer.disconnect();
      window.clearTimeout(cleanupTimer);
    };
  }, []);

  return null;
}
