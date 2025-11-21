import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

/**
 * Custom hook to handle Android hardware back button
 * 
 * Behavior:
 * - If navigation history exists: navigate back in React Router
 * - If on home page with no history: exit the app
 * - Prevents accidental app closure
 */
export const useBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only run on native platforms (Android/iOS)
    if (!Capacitor.isNativePlatform()) {
      console.log('Not a native platform, skipping back button handler');
      return;
    }

    console.log('Registering hardware back button handler...');

    let listenerHandle: any = null;

    const setupListener = async () => {
      listenerHandle = await App.addListener('backButton', ({ canGoBack }) => {
        const currentPath = window.location.pathname;
        const historyLength = window.history.length;

        console.log(`Back button pressed. Path: ${currentPath}, History: ${historyLength}, canGoBack: ${canGoBack}`);

        // Check if we're on the home/root page
        const isHomePage = currentPath === '/' || currentPath === '/tasks';

        // If we have navigation history and can go back
        if (canGoBack && historyLength > 1 && !isHomePage) {
          console.log('Navigating back in history...');
          navigate(-1);
        } 
        // If on home page with history, go back to home
        else if (!isHomePage && historyLength > 1) {
          console.log('Not on home, going back...');
          navigate(-1);
        }
        // If on home page with no history, exit app
        else if (isHomePage) {
          console.log('On home page, exiting app...');
          App.exitApp();
        }
        // Fallback: try to go back
        else {
          console.log('Fallback: attempting navigation back...');
          if (window.history.length > 1) {
            window.history.back();
          } else {
            App.exitApp();
          }
        }
      });
    };

    setupListener();

    // Cleanup listener on unmount
    return () => {
      if (listenerHandle) {
        console.log('Removing back button listener');
        listenerHandle.remove();
      }
    };
  }, [navigate, location]);

  return null;
};
