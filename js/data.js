/* data.js
   Funções de persistência (LocalStorage) para viagens e dados do usuário.
*/

export const TRIPS_KEY = "pv_trips_local";
export const USER_KEY = "pv_user_local";

export function getTrips() {
    const raw = localStorage.getItem(TRIPS_KEY);
    return raw ? JSON.parse(raw) : [];
}

export function saveTripToStore(trip) {
    const trips = getTrips();
    if (trip.id) {
        const index = trips.findIndex((t) => t.id === trip.id);
        if (index >= 0) trips[index] = trip;
        else trips.push(trip);
    } else {
        trip.id = Date.now();
        trips.push(trip);
    }
    localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
    return trip;
}

export function deleteTripFromStore(id) {
    const trips = getTrips();
    const filtered = trips.filter((trip) => trip.id !== id);
    localStorage.setItem(TRIPS_KEY, JSON.stringify(filtered));
}

export function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function saveUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}
