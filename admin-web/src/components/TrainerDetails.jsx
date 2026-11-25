import { useEffect, useState } from "react";
import { doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage, functions } from "../firebase";
import { parsePriceToCents } from "../utils/price";
import { STATUS_LABELS, formatDate, getTrainerStatus } from "../utils/trainers";
import { httpsCallable } from "firebase/functions";

const deleteTrainerFn = httpsCallable(functions, "deleteTrainer");

// Form filled out with existing trainer data
function toForm(trainer) {
  return {
    firstName: trainer.firstName ?? "",
    lastName: trainer.lastName ?? "",
    specialization: trainer.specialization ?? "",
    education: trainer.education ?? "",
    description: trainer.description ?? "",
    price: trainer.priceCents ? (trainer.priceCents / 100).toFixed(2) : "",
    locationId: trainer.locationId ?? "",
  };
}

export default function TrainerDetails({ trainer, locations, onClose }) {
    const [form, setForm] = useState(() => toForm(trainer));
    const [cvUrl, setCvUrl] = useState(null);
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const status = getTrainerStatus(trainer);
    const trainerRef = doc(db, "trainers", trainer.id);

    //CV link from Storage
    useEffect(() => {
        if (!trainer.cvPath) return;
        let cancelled = false;
        getDownloadURL(ref(storage, trainer.cvPath))
            .then((url) => {
                if (!cancelled) setCvUrl(url);
            })
            .catch((e) => {
                if (!cancelled) setError(`Could not load CV (${e.code}).`);
            });
        return () => {
            cancelled = true;
        };
    }, [trainer.cvPath]);

    function updateField(field, value) {
        setForm((f) => ({ ...f, [field]: value }));
    }

    function showError(text) {
        setNotice("");
        setError(text);
    }

    //General function for trainer actions
    async function run(action, successText) {
        setError("");
        setNotice("");
        setSaving(true);
        try {
            await action();
            setNotice(successText);
            return true;
        } catch (e) {
            const readable = e.code?.startsWith("functions/") && e.code !== "functions/internal";
            setError(readable ? e.message.replace(/\s*\[\d{3}\]$/, "") : `Something went wrong (${e.code}).`)
            return false;
        } finally {
            setSaving(false);
        }
    }

    //Approval
    function handleApprove() {
        run(
            () => 
                updateDoc(trainerRef, {
                    status: "approved",
                    rejectionReason: null,
                    reviewedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }),
            "Trainer approved."
        );
    }

    //Rejection w/reason
    async function handleReject() {
        const text = reason.trim();
        if (!text) {
            showError("Enter a rejection reason.");
            return;
        }
        const ok = await run(
            () => 
                updateDoc(trainerRef, {
                    status: "rejected",
                    rejectionReason: text,
                    reviewedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }),
            "Trainer rejected."
        );
        if (ok) {
            setRejecting(false);
            setReason("");
        }
    }

    //(De)activation
    function handleToggleActive() {
        if (
            trainer.active &&
            !window.confirm(
                `Deactivate ${trainer.firstName} ${trainer.lastName}? Clients will no longer see this trainer.`
            )
        ) {
            return;
        }
        run(
            () => updateDoc(trainerRef, { active: !trainer.active, updatedAt: serverTimestamp() }),
            trainer.active ? "Trainer deactivated." : "Trainer activated."
        );
    }

    function handleDelete() {
        const name = `${trainer.firstName} ${trainer.lastName}`;
        if (
            !window.confirm(
                `Delete ${name}?\n\nThe account, timeslots and reservations will be deleted. ` +
                "Future paid reservations will be cancelled and refunded. This cannot be undone."
            )
        ) {
            return;
        }
        run(() => deleteTrainerFn({ trainerId: trainer.id }), "Trainer deleted.");
    }

    //Update, also visible under "users"
    function handleSave(e) {
        e.preventDefault();
        const firstName = form.firstName.trim();
        const lastName = form.lastName.trim();
        const specialization = form.specialization.trim();
        const education = form.education.trim();
        const description = form.description.trim();
        const priceCents = parsePriceToCents(form.price);
    
        if (!firstName || !lastName || !specialization || !education) {
            showError("First name, last name, specialization and education are required.");
            return;
        }
        if (priceCents === null) {
            showError("Invalid price. For example: 45 or 45.50.");
            return;
        }
        if (!form.locationId) {
            showError("Choose a location.");
            return;
        }

        run(() => {
            const batch = writeBatch(db);
            batch.update(trainerRef, {
                firstName,
                lastName,
                specialization,
                education,
                description,
                priceCents,
                locationId: form.locationId,
                updatedAt: serverTimestamp(),
            });
            batch.update(doc(db, "users", trainer.id), {
                firstName,
                lastName,
                updatedAt: serverTimestamp(),
            });
            return batch.commit();
        }, "Changes saved.");
    }

    return (
        <section className="card page-form details">
            <div className="details-header">
                <div>
                <h2>
                    {trainer.firstName} {trainer.lastName}
                </h2>
                <p className="muted">{trainer.email}</p>
                </div>
                <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>
                <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
                Close
                </button>
            </div>

            <dl className="details-meta">
                <div>
                <dt>Registered</dt>
                <dd>{formatDate(trainer.createdAt)}</dd>
                </div>
                <div>
                <dt>Reviewed</dt>
                <dd>{formatDate(trainer.reviewedAt)}</dd>
                </div>
                <div>
                <dt>CV</dt>
                <dd>
                    {!trainer.cvPath ? (
                    "Not uploaded"
                    ) : cvUrl ? (
                    <a href={cvUrl} target="_blank" rel="noreferrer">
                        {trainer.cvName ?? "Open CV"}
                    </a>
                    ) : (
                    "Loading..."
                    )}
                </dd>
                </div>
            </dl>

            {status === "rejected" && trainer.rejectionReason && (
                <p className="note">Rejection reason: {trainer.rejectionReason}</p>
            )}

            {(status === "pending" || status === "rejected") &&
                (rejecting ? (
                <div className="form">
                    <label>
                    Rejection reason
                    <textarea
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Shown to the trainer in the app"
                        autoFocus
                    />
                    </label>
                    <div className="actions">
                    <button type="button" className="btn btn-danger" onClick={handleReject} disabled={saving}>
                        Reject trainer
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setRejecting(false)}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    </div>
                </div>
                ) : (
                <div className="actions">
                    <button type="button" className="btn" onClick={handleApprove} disabled={saving}>
                    Approve
                    </button>
                    {status === "pending" && (
                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setRejecting(true)}
                        disabled={saving}
                    >
                        Reject
                    </button>
                    )}
                </div>
                ))}

            {(status === "approved" || status === "inactive") && (
                <div className="actions">
                <button
                    type="button"
                    className={`btn ${trainer.active ? "btn-danger" : ""}`}
                    onClick={handleToggleActive}
                    disabled={saving}
                >
                    {trainer.active ? "Deactivate" : "Activate"}
                </button>
                </div>
            )}

            {error && <p className="error">{error}</p>}
            {notice && <p className="success">{notice}</p>}

            <form className="form details-form" onSubmit={handleSave}>
                <h3>Trainer details</h3>

                <div className="form-row">
                <label>
                    First name
                    <input value={form.firstName} onChange={(e) => updateField("firstName", e.target.value)} />
                </label>
                <label>
                    Last name
                    <input value={form.lastName} onChange={(e) => updateField("lastName", e.target.value)} />
                </label>
                </div>

                <div className="form-row">
                <label>
                    Specialization
                    <input
                    value={form.specialization}
                    onChange={(e) => updateField("specialization", e.target.value)}
                    />
                </label>
                <label>
                    Location
                    <select value={form.locationId} onChange={(e) => updateField("locationId", e.target.value)}>
                    <option value="" disabled>
                        Choose a location
                    </option>
                    {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                        {loc.name}
                        {loc.active ? "" : " (hidden)"}
                        </option>
                    ))}
                    </select>
                </label>
                <label className="narrow-field">
                    Price, €
                    <input
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => updateField("price", e.target.value)}
                    />
                </label>
                </div>

                <label>
                Education
                <textarea
                    rows={3}
                    value={form.education}
                    onChange={(e) => updateField("education", e.target.value)}
                />
                </label>
                <label>
                Description
                <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) => updateField("description", e.target.value)}
                />
                </label>

                <div className="actions">
                <button className="btn" type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save changes"}
                </button>
                </div>
            </form>
            <div className="danger-zone">
                <h3>Delete trainer</h3>
                <p className="muted">
                    Deletes the account, timeslots and reservations. Future paid reservations are cancelled
                    and refunded to clients.
                </p>
                <div className="actions">
                    <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                        {saving ? "Please wait..." : "Delete trainer"}
                    </button>
                </div>
            </div>
        </section>
  );
}