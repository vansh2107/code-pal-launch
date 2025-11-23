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
      listenerHandle = await App.addListener('backButton', () => {
        const currentPath = window.location.pathname;

        console.log(`Back button pressed. Path: ${currentPath}`);

        // Tasks page should navigate back, not exit
        if (currentPath === '/tasks') {
          console.log('On Tasks page, navigating back...');
          navigate(-1);
          return;
        }

        // Root page exits the app
        if (currentPath === '/') {
          console.log('On root page, exiting app...');
          App.exitApp();
          return;
        }

        // All other pages navigate back
        console.log('Navigating back...');
        navigate(-1);
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
