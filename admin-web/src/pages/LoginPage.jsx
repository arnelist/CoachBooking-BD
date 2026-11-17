import { useState } from "react";
import { Navigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";

const MESSAGES = {
  "auth/invalid-credential": "Invalid email or password.",
  "auth/invalid-email": "Invalid email format.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
  "auth/network-request-failed": "No internet connection.",
};

export default function LoginPage() {
  const { admin, authError, setAuthError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setAuthError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(MESSAGES[err.code] ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Already logged in admin redirected to panel
  if (admin) return <Navigate to="/trainers" replace />;

  return (
    <div className="center">
      <form className="card form login-card" onSubmit={handleSubmit}>
        <h1>CoachBooking Admin</h1>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {(error || authError) && <p className="error">{error || authError}</p>}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}