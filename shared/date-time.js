function pad(value) {
  return String(value).padStart(2, "0");
}

export function dateTimeLocalValue(date) {
  const value = new Date(date);
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
  ].join("-") + "T" + [pad(value.getHours()), pad(value.getMinutes())].join(":");
}

export function defaultWhenAt(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return dateTimeLocalValue(tomorrow);
}

export function datePart(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : "";
}

export function timeLabel(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value.slice(11, 16))) return "";
  const [hours, minutes] = value.slice(11, 16).split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return hour + ":" + pad(minutes) + " " + suffix;
}
