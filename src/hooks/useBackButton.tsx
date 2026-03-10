import { useEffect, useCallback } from 'react';
import { App } from '@capacitor/app';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

/**
 * Global stack of dismiss callbacks for open overlays.
 * Components push a callback when they open, pop when they close.
 */
const overlayDismissStack: Array<() => void> = [];

export const registerOverlayDismiss = (dismiss: () => void) => {
  overlayDismissStack.push(dismiss);
  return () => {
    const idx = overlayDismissStack.indexOf(dismiss);
    if (idx !== -1) overlayDismissStack.splice(idx, 1);
  };
};

/**
 * Try to close any open Radix/Vaul overlay by dispatching Escape.
 * Returns true if an overlay was found.
 */
const tryCloseOverlayViaDOM = (): boolean => {
  // Check for open overlays
  const overlaySelectors = [
    '[role="dialog"][data-state="open"]',
    '[role="alertdialog"][data-state="open"]',
    '[vaul-drawer][data-state="open"]',
    '[data-radix-menu-content][data-state="open"]',
    '[data-radix-popper-content-wrapper] [data-state="open"]',
    '[data-sonner-toast]',
  ];

  for (const selector of overlaySelectors) {
    const el = document.querySelector(selector);
    if (el) {
      // Dispatch Escape to the overlay element
      el.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
        bubbles: true, cancelable: true,
      }));

      // Fallback: also dispatch on document
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
        bubbles: true, cancelable: true,
      }));

      // Double-fallback after a tick: click close button or backdrop
      setTimeout(() => {
        const stillOpen = document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [vaul-drawer][data-state="open"]'
        );
        if (stillOpen) {
          const closeBtn = stillOpen.querySelector(
            'button[data-radix-dialog-close], button[aria-label="Close"], [data-dismiss]'
          ) as HTMLElement | null;
          if (closeBtn) {
            closeBtn.click();
          } else {
            const backdrop = document.querySelector(
              '[data-radix-dialog-overlay][data-state="open"], [vaul-overlay][data-state="open"]'
            ) as HTMLElement | null;
            if (backdrop) backdrop.click();
          }
        }
      }, 100);

      return true;
    }
  }

  // Check backdrop overlays
  const backdrop = document.querySelector(
    '[data-radix-dialog-overlay][data-state="open"], [data-radix-alert-dialog-overlay][data-state="open"], [vaul-overlay][data-state="open"]'
  ) as HTMLElement | null;
  if (backdrop) {
    backdrop.click();
    return true;
  }

  return false;
};

export const useBackButton = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: any = null;

    const setupListener = async () => {
      listenerHandle = await App.addListener('backButton', () => {
        // Priority 1: registered dismiss callbacks (most reliable)
        if (overlayDismissStack.length > 0) {
          const dismiss = overlayDismissStack[overlayDismissStack.length - 1];
          dismiss();
          return;
        }

        // Priority 2: DOM-based overlay detection (catches unregistered overlays)
        if (tryCloseOverlayViaDOM()) {
          return;
        }

        // Priority 3: navigation
        const currentPath = window.location.pathname;
        if (currentPath === '/' || currentPath === '/dashboard') {
          App.exitApp();
          return;
        }

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

/**
 * Hook for components to register their overlay with the back button system.
 * Call with `isOpen` state and a `close` function.
 */
export const useOverlayBackHandler = (isOpen: boolean, close: () => void) => {
  useEffect(() => {
    if (!isOpen) return;
    const unregister = registerOverlayDismiss(close);
    return unregister;
  }, [isOpen, close]);
};
