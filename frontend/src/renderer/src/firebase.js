import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCQJ6BsE1rVBq7ky1Ly0ohba3-0dHIbz8c",
  authDomain: "shuttlevision-1005d.firebaseapp.com",
  projectId: "shuttlevision-1005d",
  storageBucket: "shuttlevision-1005d.firebasestorage.app",
  messagingSenderId: "570080814688",
  appId: "1:570080814688:web:4044d53c33d923d8f64505",
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
