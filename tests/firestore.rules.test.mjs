//Firestore security rules tests (NFR4)
//Runs against the local Firestore emulator with a demo project, real data is never used.
//Run from the tests folder: npm install, then npm run test:rules (needs Java 21+ for the emulator)
import { readFileSync } from "node:fs";
import {
    initializeTestEnvironment,
    assertSucceeds,
    assertFails,
} from "@firebase/rules-unit-testing";
import {
    doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs,
    query, where, Timestamp,
} from "firebase/firestore";

//Emulator address is taken from FIRESTORE_EMULATOR_HOST, set by "firebase emulators:exec"
const env = await initializeTestEnvironment({
    projectId: "demo-coachbooking",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
});

const HOUR = 3600 * 1000;
const ts = (ms) => Timestamp.fromMillis(ms);
const now = Date.now();

//Same starting data before every case, written with rules disabled
async function seed() {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        const users = {
            admin: { role: "admin", email: "admin@t.lt", firstName: "A", lastName: "A" },
            clientA: { role: "client", email: "a@t.lt", firstName: "C", lastName: "A" },
            clientB: { role: "client", email: "b@t.lt", firstName: "C", lastName: "B" },
            trainerT: { role: "trainer", email: "t@t.lt", firstName: "T", lastName: "T" },
            trainerU: { role: "trainer", email: "u@t.lt", firstName: "T", lastName: "U" },
            pendingP: { role: "trainer", email: "p@t.lt", firstName: "P", lastName: "P" },
            trainerX: { role: "trainer", email: "trainerX@t.lt", firstName: "T", lastName: "X" },
        };
        for (const [id, user] of Object.entries(users)) await setDoc(doc(db, "users", id), user);

        await setDoc(doc(db, "trainers", "trainerT"), { status: "approved", active: true, locationId: "L1", priceCents: 3000 });
        await setDoc(doc(db, "trainers", "trainerU"), { status: "approved", active: true, locationId: "L1", priceCents: 3000 });
        await setDoc(doc(db, "trainers", "pendingP"), { status: "pending", active: true, locationId: "L1", priceCents: 3000 });
        await setDoc(doc(db, "locations", "L1"), { name: "Active", active: true });
        await setDoc(doc(db, "locations", "L2"), { name: "Hidden", active: false });

        const slot = (trainerId, status) => ({
            trainerId, locationId: "L1", status, reservationId: null,
            startAt: ts(now + 48 * HOUR), endAt: ts(now + 49 * HOUR),
        });
        await setDoc(doc(db, "timeslots", "S1"), slot("trainerT", "free"));
        await setDoc(doc(db, "timeslots", "S2"), slot("trainerU", "free"));
        await setDoc(doc(db, "timeslots", "S3"), slot("trainerT", "booked"));

        await setDoc(doc(db, "reservations", "R1"), { clientId: "clientA", trainerId: "trainerT", status: "confirmed" });
        await setDoc(doc(db, "reservations", "R2"), { clientId: "clientB", trainerId: "trainerU", status: "confirmed" });
        await setDoc(doc(db, "payments", "P1"), { reservationId: "R1", status: "succeeded" });
    });
}

const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@t.lt` }).firestore();
const guest = () => env.unauthenticatedContext().firestore();

//Valid new timeslot (tomorrow, 1 h), single fields can be overridden
const newSlot = (trainerId, overrides = {}) => ({
    trainerId, locationId: "L1", status: "free", reservationId: null,
    startAt: ts(now + 24 * HOUR), endAt: ts(now + 25 * HOUR), ...overrides,
});

//[description, expected result, action, user id (null - not signed in)]
const cases = [
    //Client
    ["Client reads own reservation", "allow", (db) => getDoc(doc(db, "reservations", "R1")), "clientA"],
    ["Client reads another client's reservation", "deny", (db) => getDoc(doc(db, "reservations", "R2")), "clientA"],
    ["Client queries own reservations", "allow", (db) => getDocs(query(collection(db, "reservations"), where("clientId", "==", "clientA"))), "clientA"],
    ["Client queries all reservations", "deny", (db) => getDocs(collection(db, "reservations")), "clientA"],
    ["Client changes own reservation status", "deny", (db) => updateDoc(doc(db, "reservations", "R1"), { status: "cancelled" }), "clientA"],
    ["Client creates a reservation directly", "deny", (db) => setDoc(doc(db, "reservations", "X"), { clientId: "clientA", trainerId: "trainerT", status: "confirmed" }), "clientA"],
    ["Client creates a timeslot", "deny", (db) => addDoc(collection(db, "timeslots"), newSlot("clientA")), "clientA"],
    ["Client deletes a trainer's free timeslot", "deny", (db) => deleteDoc(doc(db, "timeslots", "S1")), "clientA"],
    ["Client edits a location", "deny", (db) => updateDoc(doc(db, "locations", "L1"), { name: "Hacked" }), "clientA"],
    ["Client creates a location", "deny", (db) => setDoc(doc(db, "locations", "L3"), { name: "New", active: true }), "clientA"],
    ["Client approves a pending trainer", "deny", (db) => updateDoc(doc(db, "trainers", "pendingP"), { status: "approved" }), "clientA"],
    ["Client changes own role to admin", "deny", (db) => updateDoc(doc(db, "users", "clientA"), { role: "admin" }), "clientA"],
    ["Client changes own name", "allow", (db) => updateDoc(doc(db, "users", "clientA"), { firstName: "New" }), "clientA"],
    ["Client reads another user's profile", "deny", (db) => getDoc(doc(db, "users", "clientB")), "clientA"],
    ["Client reads payments", "deny", (db) => getDoc(doc(db, "payments", "P1")), "clientA"],
    ["New user registers as admin", "deny", (db) => setDoc(doc(db, "users", "newbie"), { role: "admin", email: "newbie@t.lt" }), "newbie"],
    ["New user registers as client", "allow", (db) => setDoc(doc(db, "users", "newbie"), { role: "client", email: "newbie@t.lt" }), "newbie"],
    ["Client reads a pending trainer", "deny", (db) => getDoc(doc(db, "trainers", "pendingP")), "clientA"],
    ["Client reads an approved trainer", "allow", (db) => getDoc(doc(db, "trainers", "trainerT")), "clientA"],

    //Trainer
    ["Trainer reads assigned reservation", "allow", (db) => getDoc(doc(db, "reservations", "R1")), "trainerT"],
    ["Trainer reads another trainer's reservation", "deny", (db) => getDoc(doc(db, "reservations", "R2")), "trainerT"],
    ["Trainer changes assigned reservation", "deny", (db) => updateDoc(doc(db, "reservations", "R1"), { status: "noShow" }), "trainerT"],
    ["Trainer creates own valid timeslot", "allow", (db) => addDoc(collection(db, "timeslots"), newSlot("trainerT")), "trainerT"],
    ["Trainer creates timeslot for another trainer", "deny", (db) => addDoc(collection(db, "timeslots"), newSlot("trainerU")), "trainerT"],
    ["Trainer creates timeslot in the past", "deny", (db) => addDoc(collection(db, "timeslots"), newSlot("trainerT", { startAt: ts(now - 2 * HOUR), endAt: ts(now - HOUR) })), "trainerT"],
    ["Trainer creates timeslot more than 7 days ahead", "deny", (db) => addDoc(collection(db, "timeslots"), newSlot("trainerT", { startAt: ts(now + 8 * 24 * HOUR), endAt: ts(now + 8 * 24 * HOUR + HOUR) })), "trainerT"],
    ["Trainer creates timeslot ending before start", "deny", (db) => addDoc(collection(db, "timeslots"), newSlot("trainerT", { endAt: ts(now + 23 * HOUR) })), "trainerT"],
    ["Trainer creates timeslot at another location", "deny", (db) => addDoc(collection(db, "timeslots"), newSlot("trainerT", { locationId: "L2" })), "trainerT"],
    ["Trainer creates already booked timeslot", "deny", (db) => addDoc(collection(db, "timeslots"), newSlot("trainerT", { status: "booked" })), "trainerT"],
    ["Trainer deletes own free timeslot", "allow", (db) => deleteDoc(doc(db, "timeslots", "S1")), "trainerT"],
    ["Trainer deletes another trainer's timeslot", "deny", (db) => deleteDoc(doc(db, "timeslots", "S2")), "trainerT"],
    ["Trainer deletes own booked timeslot", "deny", (db) => deleteDoc(doc(db, "timeslots", "S3")), "trainerT"],
    ["Trainer marks own timeslot as booked", "deny", (db) => updateDoc(doc(db, "timeslots", "S1"), { status: "booked" }), "trainerT"],
    ["Trainer edits own trainer profile", "deny", (db) => updateDoc(doc(db, "trainers", "trainerT"), { priceCents: 1 }), "trainerT"],
    ["Trainer edits a location", "deny", (db) => updateDoc(doc(db, "locations", "L1"), { name: "Hacked" }), "trainerT"],
    ["Pending trainer creates a timeslot", "deny", (db) => addDoc(collection(db, "timeslots"), newSlot("pendingP")), "pendingP"],
    ["Trainer registers as already approved", "deny", (db) => setDoc(doc(db, "trainers", "trainerX"), { status: "approved", active: true, priceCents: 3000 }), "trainerX"],

    //Admin
    ["Admin approves a pending trainer", "allow", (db) => updateDoc(doc(db, "trainers", "pendingP"), { status: "approved" }), "admin"],
    ["Admin creates a location", "allow", (db) => setDoc(doc(db, "locations", "L3"), { name: "New", active: true }), "admin"],
    ["Admin edits a location", "allow", (db) => updateDoc(doc(db, "locations", "L1"), { name: "Renamed" }), "admin"],
    ["Admin reads hidden location", "allow", (db) => getDoc(doc(db, "locations", "L2")), "admin"],
    ["Admin reads payments", "allow", (db) => getDoc(doc(db, "payments", "P1")), "admin"],
    ["Admin changes a reservation directly", "deny", (db) => updateDoc(doc(db, "reservations", "R1"), { status: "cancelled" }), "admin"],
    ["Admin changes a user's role", "deny", (db) => updateDoc(doc(db, "users", "clientA"), { role: "admin" }), "admin"],

    //Not signed in
    ["Guest reads active location", "allow", (db) => getDoc(doc(db, "locations", "L1")), null],
    ["Guest reads hidden location", "deny", (db) => getDoc(doc(db, "locations", "L2")), null],
    ["Guest reads timeslots", "deny", (db) => getDocs(collection(db, "timeslots")), null],
    ["Guest reads reservations", "deny", (db) => getDoc(doc(db, "reservations", "R1")), null],
];

let passed = 0;
for (const [name, expected, action, uid] of cases) {
    await seed();
    const db = uid ? as(uid) : guest();
    try {
        if (expected === "allow") await assertSucceeds(action(db));
        else await assertFails(action(db));
        passed++;
        console.log(`PASS  [${expected.padEnd(5)}] ${uid ?? "guest"}: ${name}`);
    } catch (e) {
        console.log(`FAIL  [${expected.padEnd(5)}] ${uid ?? "guest"}: ${name}`);
        console.log(`      ${e.message.split("\n")[0]}`);
    }
}

console.log(`\n${passed}/${cases.length} passed`);
await env.cleanup();
process.exit(passed === cases.length ? 0 : 1);
