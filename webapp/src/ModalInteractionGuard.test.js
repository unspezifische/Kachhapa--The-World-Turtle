import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import ModalInteractionGuard, { cleanupOrphanedModalArtifacts } from './ModalInteractionGuard';

afterEach(() => {
  document.querySelectorAll('.modal, .modal-backdrop, .MuiModal-root').forEach(node => node.remove());
  document.body.classList.remove('modal-open');
  document.body.removeAttribute('data-rr-ui-modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
});

test('removes an orphaned Bootstrap backdrop and releases the page lock', () => {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop show';
  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');
  document.body.setAttribute('data-rr-ui-modal-open', '');
  document.body.style.overflow = 'hidden';
  document.body.style.paddingRight = '15px';

  expect(cleanupOrphanedModalArtifacts()).toBe(true);
  expect(document.querySelector('.modal-backdrop')).toBeNull();
  expect(document.body).not.toHaveClass('modal-open');
  expect(document.body).not.toHaveAttribute('data-rr-ui-modal-open');
  expect(document.body.style.overflow).toBe('');
  expect(document.body.style.paddingRight).toBe('');
});

test('does not interfere with a Bootstrap modal that is still open', () => {
  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.setAttribute('aria-modal', 'true');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop show';
  document.body.append(modal, backdrop);
  document.body.classList.add('modal-open');

  expect(cleanupOrphanedModalArtifacts()).toBe(false);
  expect(document.querySelector('.modal-backdrop')).toBe(backdrop);
  expect(document.body).toHaveClass('modal-open');
});

test('does not interfere while a Bootstrap modal is transitioning open', () => {
  const modal = document.createElement('div');
  modal.className = 'modal fade';
  modal.setAttribute('role', 'dialog');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop fade';
  document.body.append(modal, backdrop);
  document.body.classList.add('modal-open');
  document.body.setAttribute('data-rr-ui-modal-open', '');
  document.body.style.overflow = 'hidden';

  expect(cleanupOrphanedModalArtifacts()).toBe(false);
  expect(document.querySelector('.modal-backdrop')).toBe(backdrop);
  expect(document.body).toHaveClass('modal-open');
  expect(document.body).toHaveAttribute('data-rr-ui-modal-open');
  expect(document.body.style.overflow).toBe('hidden');
});

test('automatically repairs artifacts left behind after a modal unmounts', async () => {
  jest.useFakeTimers();
  render(<ModalInteractionGuard />);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop show';
  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');

  await act(async () => {
    jest.advanceTimersByTime(100);
  });

  await waitFor(() => expect(document.querySelector('.modal-backdrop')).toBeNull());
  expect(document.body).not.toHaveClass('modal-open');
  jest.useRealTimers();
});
