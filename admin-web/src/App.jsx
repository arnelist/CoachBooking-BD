import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AdminLayout from "./components/AdminLayout";
import LoginPage from "./pages/LoginPage";
import TrainersPage from "./pages/TrainersPage";
import LocationsPage from "./pages/LocationsPage";

// If logged out, redirect to login
function RequireAdmin({ children }) {
  const { admin } = useAuth();
  if (admin === undefined) return <div className="center muted">Loading...</div>;
  if (!admin) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route path="/trainers" element={<TrainersPage />} />
            <Route path="/locations" element={<LocationsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/trainers" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}