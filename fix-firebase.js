const fs = require('fs');
const path = require('path');

// Read the current Firebase config
const firebaseConfigPath = path.join(__dirname, 'config', 'firebase.js');
let firebaseConfig = fs.readFileSync(firebaseConfigPath, 'utf8');

// Replace the validateFirebaseConfig function with a non-throwing version
firebaseConfig = firebaseConfig.replace(
  /const validateFirebaseConfig = \(\) => \{[\s\S]*?\};/,
  `// Check Firebase configuration without throwing errors
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
      console.log(\`❌ \${varName}: Missing or placeholder value\`);
      hasValidConfig = false;
    } else {
      console.log(\`✅ \${varName}: Present\`);
    }
  });

  return { hasValidConfig };
};`
);

// Replace the initialization block
firebaseConfig = firebaseConfig.replace(
  /try \{[\s\S]*?validateFirebaseConfig\(\);[\s\S]*?\} catch \(error\) \{[\s\S]*?\}/,
  `try {
  const { hasValidConfig } = checkFirebaseConfig();
  
  if (!hasValidConfig) {
    console.log('⚠️  Firebase configuration incomplete. Running in limited mode.');
    console.log('   Firebase authentication will not work until proper credentials are provided.');
    firebaseInitialized = false;
  } else {
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID.trim(),
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID.trim(),
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\\\n/g, '\\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL.trim(),
      client_id: process.env.FIREBASE_CLIENT_ID.trim(),
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
  initializationError = error;
  console.error('❌ Firebase initialization failed:', error.message);
  firebaseInitialized = false;
}`
);

// Write the modified config back
fs.writeFileSync(firebaseConfigPath, firebaseConfig);

console.log('✅ Firebase configuration updated to handle missing credentials gracefully');
console.log('🔄 Please restart the server for changes to take effect');