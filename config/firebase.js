const admin = require('firebase-admin');

// Check Firebase configuration without throwing errors
const checkFirebaseConfig = () => {
  console.log('Checking Firebase configuration...');
  
  const requiredVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY_ID', 
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_CLIENT_ID'
  ];

  let hasValidConfig = true;

  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (!value || value.includes('your_') || value.includes('placeholder')) {
      console.log(`❌ ${varName}: Missing or placeholder value`);
      hasValidConfig = false;
    } else {
      console.log(`✅ ${varName}: Present`);
    }
  });

  return { hasValidConfig };
};

// Initialize Firebase only if valid config exists
let firebaseInitialized = false;
let firebaseError = null;

try {
  const { hasValidConfig } = checkFirebaseConfig();
  
  if (!hasValidConfig) {
    console.log('⚠️  Firebase configuration incomplete. Running in limited mode.');
    console.log('   Firebase authentication will not work until proper credentials are provided.');
    console.log('   To fix: Update your .env file with valid Firebase service account credentials.');
    firebaseInitialized = false;
  } else {
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
      token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    };

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      console.log('✅ Firebase Admin SDK initialized successfully');
    }
  }
} catch (error) {
  firebaseError = error;
  console.error('❌ Firebase initialization failed:', error.message);
  firebaseInitialized = false;
}

// Enhanced error handler
const handleFirebaseError = (operation, error) => {
  if (firebaseError || !firebaseInitialized) {
    return {
      success: false,
      error: 'Firebase not available. Please configure Firebase credentials in your .env file.',
      code: 'firebase/not-configured'
    };
  }

  if (error.code === 'auth/id-token-expired') {
    return {
      success: false,
      error: 'Firebase ID token has expired',
      code: 'auth/id-token-expired'
    };
  }

  if (error.code === 'auth/id-token-revoked') {
    return {
      success: false,
      error: 'Firebase ID token has been revoked',
      code: 'auth/id-token-revoked'
    };
  }

  return {
    success: false,
    error: `Firebase ${operation} failed: ${error.message}`,
    code: error.code || 'firebase/unknown-error'
  };
};

// Export admin instance with error handling
const firebaseAdmin = admin;
firebaseAdmin.handleFirebaseError = handleFirebaseError;
firebaseAdmin.isInitialized = () => firebaseInitialized;
firebaseAdmin.getError = () => firebaseError;

module.exports = firebaseAdmin;
