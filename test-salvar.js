import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function check() {
  const q = query(collection(db, 'despesas'));
  const snap = await getDocs(q);
  console.log(`Found ${snap.size} documents.`);
  process.exit(0);
}
check();
