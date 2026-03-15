const value = (key: string, fallback = '') => import.meta.env[key] ?? fallback;

export const env = {
  firebase: {
    apiKey: value('VITE_FIREBASE_API_KEY'),
    authDomain: value('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: value('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: value('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: value('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: value('VITE_FIREBASE_APP_ID'),
    measurementId: value('VITE_FIREBASE_MEASUREMENT_ID'),
  },
  functionsUrl: value('VITE_FUNCTIONS_URL', '/api'),
  bootstrapAdminEmail: value('VITE_BOOTSTRAP_ADMIN_EMAIL', 'admin@hunteinvest.com'),
};

export const hasFirebaseConfig = Object.values(env.firebase).every(Boolean);
