import { VirtualizedSectionList } from "react-native";

const TIME_ZONE = "Europe/Vilnius";
const pad = (n) => String(n).padStart(2, "0");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const vilniusFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

function vilniusParts(date) {
    const parts = {};
    for (const { type, value } of vilniusFormat.formatToParts(date)) {
        if (type !== "literal") parts[type] = Number(value);
    }
    return parts;
}

export function toDateKey(date) {
    const p = vilniusParts(date);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function nowMinutes() {
    const p = vilniusParts(new Date());
    return p.hour * 60 + p.minute;
}

//Today and "count -1" days ahead in Vilnius
export function getNextDays(count) {
    const today = vilniusParts(new Date());
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
        return {
            key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
            weekday: i === 0 ? "Today" : WEEKDAYS[d.getUTCDay()],
            day: d.getUTCDate(),
            month: MONTHS[d.getUTCMonth()],
        };
    });
}

export function timeToMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

export function minutesToTime(minutes) {
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function toDate(dateKey, time) {
    const [y, mo, d] = dateKey.split("-").map(Number);
    const [h, mi] = time.split(":").map(Number);
    const asUtc = Date.UTC(y, mo - 1, d, h, mi);
    //Vilnius is UTC+2 in winter and UTC+3 in summer, find the offset of that day
    const p = vilniusParts(new Date(asUtc));
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - asUtc;
    return new Date(asUtc - offset);
}