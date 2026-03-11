import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const firebaseConfig = {
  apiKey: "AIzaSyA5eKymLFvDLWXdodk-AvDP6P9dzjhmnI4",
  authDomain: "tiktok-live-monitor-b6c4d.firebaseapp.com",
  projectId: "tiktok-live-monitor-b6c4d",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function test() {
  try {
    const cred = await createUserWithEmailAndPassword(auth, 'test@example.com', 'password123');
    const token = await cred.user.getIdToken();
    console.log('Token:', token.substring(0, 20) + '...');
    
    const res = await axios.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    const publicKeys = res.data;
    
    const decodedHeader = jwt.decode(token, { complete: true });
    const kid = (decodedHeader as any).header.kid;
    const publicKey = publicKeys[kid];
    
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    console.log('Decoded:', decoded);
  } catch (e) {
    console.error(e);
  }
}
test();
