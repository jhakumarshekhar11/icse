// Source of assets/vendor/firebase-lite.js: only the Firebase pieces the site uses, bundled into one
// plain script (no build step is needed to run the site). To rebuild after a Firebase upgrade:
//   npm i firebase esbuild
//   npx esbuild scripts/firebase-entry.js --bundle --minify --format=iife --target=es2019 --outfile=assets/vendor/firebase-lite.js
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signInWithCredential, signOut,
  sendPasswordResetEmail, updateProfile, sendEmailVerification, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider,
  applyActionCode, checkActionCode, verifyPasswordResetCode, confirmPasswordReset
} from 'firebase/auth';
import {
  getFirestore, initializeFirestore, doc, setDoc, updateDoc, onSnapshot, serverTimestamp, deleteField, FieldPath
} from 'firebase/firestore';

window.ICSE_FB = {
  initializeApp,
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signInWithCredential, signOut,
  sendPasswordResetEmail, updateProfile, sendEmailVerification, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider,
  applyActionCode, checkActionCode, verifyPasswordResetCode, confirmPasswordReset,
  getFirestore, initializeFirestore, doc, setDoc, updateDoc, onSnapshot, serverTimestamp, deleteField, FieldPath
};
