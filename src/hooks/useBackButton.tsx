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
          // Find and click the close button, or press Escape to dismiss
          const closeBtn = openOverlay.querySelector('[data-radix-collection-item]') as HTMLElement | null;
          if (closeBtn) {
            closeBtn.click();
          } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          }
          return;
        }

        // Also check for any generic overlay that Radix renders as a sibling
        const overlayBackdrop = document.querySelector(
          '[data-state="open"][data-radix-dialog-overlay], ' +
          '[data-state="open"][data-radix-alert-dialog-overlay]'
        );
        if (overlayBackdrop) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
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
