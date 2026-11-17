// Shows state: approved, but disabled trainer is "inactive"
export function getTrainerStatus(trainer) {
  if (trainer.status === "approved" && !trainer.active) return "inactive";
  return trainer.status;
}

export const STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  inactive: "Inactive",
  rejected: "Rejected",
};

// Firestore Timestamp, until serverTimestamp not verified, shows "-""
export function formatDate(timestamp) {
  return timestamp ? timestamp.toDate().toLocaleDateString("lt-LT") : "—";
}