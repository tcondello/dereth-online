import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firebaseAuth, firestore } from './firebase';

export interface GoogleUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

// ── Sign in / out ────────────────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<GoogleUser> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(firebaseAuth, provider);
  const { uid, displayName, photoURL } = result.user;
  return { uid, displayName, photoURL };
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(firebaseAuth, email, password);
}

export async function createAccount(email: string, password: string, displayName: string): Promise<void> {
  const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  await updateProfile(result.user, { displayName });
}

export async function signOut(): Promise<void> {
  await fbSignOut(firebaseAuth);
}

export function getCurrentUser(): User | null {
  return firebaseAuth.currentUser;
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth, callback);
}

// ── SpacetimeDB token persistence ────────────────────────────────────────────
// Maps Google UID → SpacetimeDB token so the same identity is used on every device.

const COLLECTION = 'spacetime_tokens';

export async function loadStoredToken(uid: string): Promise<string | undefined> {
  const snap = await getDoc(doc(firestore, COLLECTION, uid));
  return snap.exists() ? (snap.data().token as string) : undefined;
}

export async function saveStoredToken(uid: string, token: string): Promise<void> {
  await setDoc(doc(firestore, COLLECTION, uid), { token }, { merge: true });
}
