const capitalize = (part) => part.charAt(0).toUpperCase() + part.slice(1);

// "  jonas  " → "Jonas", "ona-marija" → "Ona-Marija", "jonas petras" → "Jonas Petras"
export function formatName(value) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.split("-").map(capitalize).join("-"))
    .join(" ");
}