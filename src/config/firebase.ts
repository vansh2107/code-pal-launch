import { initializeApp } from 'firebase/app';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app;
let messaging;

export const initializeFirebase = async () => {
  try {
    if (!app) {
      app = initializeApp(firebaseConfig);
    }
    
    const supported = await isSupported();
    if (supported && !messaging) {
      messaging = getMessaging(app);
    }
    
    return { app, messaging };
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return { app: null, messaging: null };
  }
};

export { messaging };
