import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import TrainerDetails from "../components/TrainerDetails";
import { formatPrice } from "../utils/price";
import { STATUS_LABELS, formatDate, getTrainerStatus } from "../utils/trainers";

const FILTERS = ["pending", "approved", "inactive", "rejected", "all"];

export default function TrainersPage() {
  const [trainers, setTrainers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");
  const [selectedId, setSelectedId] = useState(null);

  //Listed real-time, latest at the top
  useEffect(() => {
    const q = query(collection(db, "trainers"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        setTrainers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => {
        setError(`Could not load trainers (${e.code}).`);
        setLoading(false);
      }
    );
  }, []);

  //Locations - drop-down list
  useEffect(() => {
    const q = query(collection(db, "locations"), orderBy("order", "asc"));
    return onSnapshot(
      q,
      (snap) => setLocations(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => setError(`Could not load locations (${e.code}).`)
    );
  }, []);

  const locationNames = useMemo(
    () => Object.fromEntries(locations.map((loc) => [loc.id, loc.name])),
    [locations]
  );

   const counts = useMemo(() => {
    const result = { all: trainers.length };
    for (const t of trainers) {
      const s = getTrainerStatus(t);
      result[s] = (result[s] ?? 0) + 1;
    }
    return result;
  }, [trainers]);

  const visible =
    filter === "all" ? trainers : trainers.filter((t) => getTrainerStatus(t) === filter);

  const selected = trainers.find((t) => t.id === selectedId) ?? null;

  function openTrainer(id) {
    setSelectedId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <h1>Trainers</h1>

      {selected && (
        <TrainerDetails
          key={selected.id}
          trainer={selected}
          locations={locations}
          onClose={() => setSelectedId(null)}
        />
      )}

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`filter ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
            <span className="count">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : visible.length === 0 ? (
        <p className="muted">No trainers here.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Specialization</th>
              <th>Location</th>
              <th>Price</th>
              <th>Registered</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => {
              const status = getTrainerStatus(t);
              return (
                <tr key={t.id} className={t.id === selectedId ? "selected" : ""}>
                  <td>
                    <div>
                      {t.firstName} {t.lastName}
                    </div>
                    <div className="muted small">{t.email}</div>
                  </td>
                  <td>{t.specialization}</td>
                  <td>{locationNames[t.locationId] ?? "—"}</td>
                  <td>{t.priceCents ? formatPrice(t.priceCents) : "—"}</td>
                  <td>{formatDate(t.createdAt)}</td>
                  <td>
                    <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-small" onClick={() => openTrainer(t.id)}>
                      {status === "pending" ? "Review" : "Open"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}