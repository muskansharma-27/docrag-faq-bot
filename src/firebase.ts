import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  updateProfile,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const registerWithEmail = async (name: string, email: string, password: string) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (name.trim()) {
    await updateProfile(result.user, { displayName: name.trim() });
  }
  return result;
};
export const loginWithEmail = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password);
export const requestPasswordReset = async (email: string) => {
  const methods = await fetchSignInMethodsForEmail(auth, email);
  const hasPasswordLogin = methods.includes('password');
  if (!hasPasswordLogin) {
    throw new Error('NO_PASSWORD_ACCOUNT');
  }

  return sendPasswordResetEmail(auth, email, {
    url: window.location.origin,
    handleCodeInApp: false,
  });
};
export const logout = () => signOut(auth);

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
