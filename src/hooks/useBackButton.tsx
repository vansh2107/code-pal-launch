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
        // Strategy 1: Find any open Radix/Vaul overlay and close it
        // We use multiple selector strategies to catch all overlay types

        // Radix dialogs, sheets, alert-dialogs
        const selectors = [
          '[role="dialog"][data-state="open"]',
          '[role="alertdialog"][data-state="open"]',
          '[vaul-drawer][data-state="open"]',
          '[data-radix-menu-content][data-state="open"]',
          '[data-radix-popper-content-wrapper] [data-state="open"]',
          // Sonner toasts
          '[data-sonner-toast]',
        ];

        let closedOverlay = false;

        for (const selector of selectors) {
          const overlay = document.querySelector(selector);
          if (overlay) {
            // Try dispatching Escape on the overlay itself
            const escEvent = new KeyboardEvent('keydown', {
              key: 'Escape',
              code: 'Escape',
              keyCode: 27,
              which: 27,
              bubbles: true,
              cancelable: true,
            });
            overlay.dispatchEvent(escEvent);
            closedOverlay = true;
            break;
          }
        }

        if (closedOverlay) {
          // Double-check: if overlay is still there after a tick, try clicking the close button
          setTimeout(() => {
            const stillOpen = document.querySelector(
              '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [vaul-drawer][data-state="open"]'
            );
            if (stillOpen) {
              // Try finding a close button inside the overlay
              const closeBtn = stillOpen.querySelector(
                'button[data-radix-dialog-close], button[aria-label="Close"], [data-dismiss]'
              ) as HTMLElement | null;
              if (closeBtn) {
                closeBtn.click();
              } else {
                // Try clicking the overlay backdrop to close
                const backdrop = document.querySelector(
                  '[data-radix-dialog-overlay][data-state="open"], [vaul-overlay][data-state="open"]'
                ) as HTMLElement | null;
                if (backdrop) backdrop.click();
              }
            }
          }, 50);
          return;
        }

        // Strategy 2: Check for any overlay/backdrop that might be open
        const backdrop = document.querySelector(
          '[data-radix-dialog-overlay][data-state="open"], [data-radix-alert-dialog-overlay][data-state="open"], [vaul-overlay][data-state="open"]'
        ) as HTMLElement | null;
        if (backdrop) {
          backdrop.click();
          return;
        }

        // Strategy 3: Check for any element with data-state="open" that looks like a popup
        const anyOpen = document.querySelector(
          '[data-state="open"][class*="fixed"], [data-state="open"][class*="absolute"]'
        );
        if (anyOpen) {
          const esc = new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
            bubbles: true, cancelable: true,
          });
          document.dispatchEvent(esc);
          return;
        }

        // No overlay open — handle navigation
        const currentPath = window.location.pathname;

        // Root page exits the app
        if (currentPath === '/' || currentPath === '/dashboard') {
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
