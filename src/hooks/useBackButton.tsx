import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

/**
 * Custom hook to handle Android hardware back button.
 *
 * Priority order:
 * 1. Close any open overlay (dialog, sheet, popover, dropdown, alert-dialog, drawer)
 * 2. Navigate back in React Router history
 * 3. Exit app if on the home page
 */
export const useBackButton = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: any = null;

    const setupListener = async () => {
      listenerHandle = await App.addListener('backButton', () => {
        // 1. Try to close any open Radix overlay (dialog, sheet, alert-dialog, popover, dropdown, drawer)
        const openOverlay = document.querySelector(
          '[data-state="open"][role="dialog"], ' +
          '[data-state="open"][role="alertdialog"], ' +
          'div[data-state="open"][data-radix-popper-content-wrapper], ' +
          '[vaul-drawer][data-state="open"], ' +
          '[data-radix-menu-content][data-state="open"]'
        );

        if (openOverlay) {
          // Dispatch Escape directly on the overlay element so Radix intercepts it
          const escEvent = new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
          });
          openOverlay.dispatchEvent(escEvent);
          return;
        }

        // Also check for overlay backdrop (rendered as sibling)
        const overlayBackdrop = document.querySelector(
          '[data-state="open"][data-radix-dialog-overlay], ' +
          '[data-state="open"][data-radix-alert-dialog-overlay]'
        );
        if (overlayBackdrop) {
          const escEvent = new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
          });
          overlayBackdrop.dispatchEvent(escEvent);
          return;
        }

        const currentPath = window.location.pathname;

        // Root page exits the app
        if (currentPath === '/') {
          App.exitApp();
          return;
        }

        // All other pages navigate back
        navigate(-1);
      });
    };

    setupListener();

    return () => {
      if (listenerHandle) listenerHandle.remove();
    };
  }, [navigate]);

  return null;
};
