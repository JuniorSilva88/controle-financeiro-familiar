import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  projectId: 'stately-scheme-lnm8c'
});
const db = getFirestore(app);
db.settings({ databaseId: 'ai-studio-controlefinancei-e59714e7-fd94-4e40-9508-4a8e9fcbf685' });

async function check() {
  const snapshot = await db.collection('despesas').get();
  console.log(`Found ${snapshot.size} documents.`);
  snapshot.forEach(doc => {
    console.log(doc.id, doc.data());
  });
}
check();
