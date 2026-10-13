// Run only on a trusted machine with Firebase Admin credentials in the environment.
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const [uid, role] = process.argv.slice(2);
if (!uid || !['moderator', 'admin', 'remove'].includes(role)) {
  console.error('Usage: node scripts/set-moderator-claim.mjs <Firebase UID> <moderator|admin|remove>');
  process.exit(1);
}
const { FIREBASE_ADMIN_PROJECT_ID: projectId, FIREBASE_ADMIN_CLIENT_EMAIL: clientEmail, FIREBASE_ADMIN_PRIVATE_KEY: privateKey } = process.env;
if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase Admin credentials are required in the environment.');
initializeApp({ credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }) });
const auth = getAuth();
const user = await auth.getUser(uid);
const profile = getFirestore().doc(`users/${uid}`);
if (!(await profile.get()).exists) throw new Error('Create the user profile before assigning staff permissions.');
const claims = { ...user.customClaims };
delete claims.admin;
delete claims.moderator;
if (role !== 'remove') claims[role] = true;
await auth.setCustomUserClaims(uid, claims);
// Invalidates old sessions, including sessions with removed privileges.
await auth.revokeRefreshTokens(uid);
const refreshed = await auth.getUser(uid);
await getFirestore().doc(`authRevocations/${uid}`).set({
  validAfter: Math.floor(Date.parse(refreshed.tokensValidAfterTime) / 1000),
});
// These fields control existing staff UI only; authorization uses signed claims.
await profile.update({
  role: role === 'remove' ? 'user' : role,
  isAdmin: role === 'admin',
  isModerator: role === 'moderator',
});
console.log('Claims updated; user must sign in again.');
