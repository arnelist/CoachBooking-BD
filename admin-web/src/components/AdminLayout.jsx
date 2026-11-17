import { NavLink, Outlet } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";

export default function AdminLayout() {
  const { admin } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-title">CoachBooking</div>
        <NavLink to="/trainers">Trainers</NavLink>
        <NavLink to="/locations">Locations</NavLink>

        <div className="sidebar-footer">
          <span>
            {admin.firstName} {admin.lastName}
          </span>
          <button className="btn btn-secondary btn-small" onClick={() => signOut(auth)}>
            Log out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}