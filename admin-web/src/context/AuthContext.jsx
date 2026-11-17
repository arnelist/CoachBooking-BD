import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    ///undefined - checking, null - not logged in, object - admin
    const [admin, setAdmin] = useState("");
    const [authError, setAuthError] = useState("");

    useEffect(() => {
        return onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setAdmin(null);
                return;
            }
            try {
                const snap = await getDoc(doc(db, "users", user.uid));
                if (snap.exists() && snap.data().role === "admin") {
                    setAuthError("");
                    setAdmin({ uid: user.uid, ...snap.data() });
                } else {
                    setAuthError("Access denied. This panel is for administrators only.");
                    await signOut(auth);
                }
            } catch {
                setAuthError("Could not verify your account. Please try again.");
                await signOut(auth);
            }
        });
    }, []);

    return (
        <AuthContext.Provider value={{ admin, authError, setAuthError }}>
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    return useContext(AuthContext);
}