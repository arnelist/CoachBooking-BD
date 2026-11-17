import { createContext, useState, useEffect, useContext } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

const AuthContext = createContext(null);

//undefined - loading, null - none
export function AuthProvider({ children }) {
    const [user, setUser] = useState(undefined);
    const [profile, setProfile] = useState(undefined);
    const [trainer, setTrainer] = useState(undefined);

    //is logged in
    useEffect(() => onAuthStateChanged(auth, setUser), []);

    //profile and role
    useEffect(() => {
        if (!user) {
            setProfile(user === null ? null : undefined);
            return;
        }
        setProfile(undefined);

        let unsubscribe = () => {};
        let retryTimer = null;

        function listen(attempt) {
            unsubscribe = onSnapshot(
                doc(db, "users", user.uid),
                (snap) => setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null),
                (error) => {
                    console.log("Error fetching profile: ", error.code);
                    if (attempt < 3) retryTimer = setTimeout(() => listen(attempt + 1), 1000);
                }
            );
        }

        listen(1);
        return () => {
            unsubscribe();
            clearTimeout(retryTimer);
        };
    }, [user]);

    //trainer state
    const isTrainer = profile?.role === "trainer";

    useEffect(() => {
        if (!user || !isTrainer) {
            setTrainer(null);
            return;
        }
        setTrainer(undefined);
        return onSnapshot(
            doc(db, 'trainers', user.uid), 
            (snap) => setTrainer(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            (error) => {
                console.log('Error fetching trainer:', error.code);
                setTrainer(null);
            }
        );
    }, [user, isTrainer]);

    return (
        <AuthContext.Provider value={{ user, profile, trainer }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}