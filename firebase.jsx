import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

// Import config from json file
import firebaseConfig from './firebaseConfig.json';

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, auth, storage, ref, uploadBytes, RecaptchaVerifier, signInWithPhoneNumber  }