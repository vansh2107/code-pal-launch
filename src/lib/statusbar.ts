import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export const initializeStatusBar = async () => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // Make status bar transparent and overlay webview
    await StatusBar.setOverlaysWebView({ overlay: true });
    
    // Set transparent background
    await StatusBar.setBackgroundColor({ color: '#00000000' });
    
    // Set light content (white icons) for dark backgrounds
    await StatusBar.setStyle({ style: Style.Light });
    
    console.log('StatusBar initialized successfully');
  } catch (error) {
    console.error('Error initializing StatusBar:', error);
  }
};
