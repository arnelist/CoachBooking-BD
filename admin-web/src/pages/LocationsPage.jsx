import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

const EMPTY_FORM = { name: "", address: "", order: "", active: true };

export default function LocationsPage() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  //Real-time - any changes are seen instantly
  useEffect(() => {
    const q = query(collection(db, "locations"), orderBy("order", "asc"));
    return onSnapshot(
      q,
      (snap) => {
        setLocations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => {
        setError(`Could not load locations (${e.code}).`);
        setLoading(false);
      }
    );
  }, []);

  //If order undefined, locations gets added to end of list
  const nextOrder = locations.length 
    ? Math.max(...locations.map((l) => l.order ?? 0)) + 1 
    : 1;

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function startEdit(loc) {
    setEditingId(loc.id);
    setForm({
      name: loc.name,
      address: loc.address,
      order: String(loc.order),
      active: loc.active,
    });
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  //Add, edit
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const name = form.name.trim();
    const address = form.address.trim();
    const order = form.order === "" ? nextOrder : Number(form.order);

    if (!name || !address) {
      setError("Name and address are required.");
      return;
    }
    if (!Number.isInteger(order) || order < 0) {
      setError("Order must be a whole number (0 or more).");
      return;
    }

    setSaving(true);
    try {
      const data = { name, address, order, active: form.active, updatedAt: serverTimestamp() };
      if (editingId) {
        await updateDoc(doc(db, "locations", editingId), data);
      } else {
        await addDoc(collection(db, "locations"), { ...data, createdAt: serverTimestamp() });
      }
      resetForm();
    } catch (err) {
      setError(`Could not save location (${err.code}).`);
    } finally {
      setSaving(false);
    }
  }

  //Show or hide
  async function toggleActive(loc) {
    setError("");
    try {
      await updateDoc(doc(db, "locations", loc.id), {
        active: !loc.active,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      setError(`Could not update location (${e.code}).`);
    }
  }

  //Removal (not when trainers are assigned to it)
  async function handleDelete(loc) {
    setError("");
    try {
      const assigned = await getDocs(
        query(collection(db, "trainers"), where("locationId", "==", loc.id), limit(1))
      );
      if (!assigned.empty) {
        setError(
          `"${loc.name}" has trainers assigned. Move them to another location first, or hide this location instead.`
        );
        return;
      }
      if (!window.confirm(`Delete "${loc.name}"? This cannot be undone.`)) return;

      await deleteDoc(doc(db, "locations", loc.id));
      if (editingId === loc.id) resetForm();
    } catch (e) {
      setError(`Could not delete location (${e.code}).`);
    }
  }

  return (
    <>
      <h1>Locations</h1>

      <form className="card form page-form" onSubmit={handleSubmit}>
        <h2>{editingId ? "Edit location" : "Add location"}</h2>

        <div className="form-row">
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Impuls Ozas"
            />
          </label>
          <label>
            Address
            <input
              value={form.address}
              onChange={(e) => updateField("address", e.target.value)}
              placeholder="Ozo g. 18, Vilnius"
            />
          </label>
          <label className="narrow-field">
            Order
            <input
              type="number"
              min="0"
              step="1"
              value={form.order}
              onChange={(e) => updateField("order", e.target.value)}
              placeholder={String(nextOrder)}
            />
          </label>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => updateField("active", e.target.checked)}
          />
          Visible to clients
        </label>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving..." : editingId ? "Save changes" : "Add location"}
          </button>
          {editingId && (
            <button type="button" className="btn btn-secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : locations.length === 0 ? (
        <p className="muted">No locations yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Name</th>
              <th>Address</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => (
              <tr key={loc.id}>
                <td>{loc.order}</td>
                <td>{loc.name}</td>
                <td>{loc.address}</td>
                <td>
                  <span className={`badge ${loc.active ? "badge-approved" : "badge-inactive"}`}>
                    {loc.active ? "Active" : "Hidden"}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="btn btn-secondary btn-small" onClick={() => startEdit(loc)}>
                      Edit
                    </button>
                    <button className="btn btn-secondary btn-small" onClick={() => toggleActive(loc)}>
                      {loc.active ? "Hide" : "Show"}
                    </button>
                    <button className="btn btn-danger btn-small" onClick={() => handleDelete(loc)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}