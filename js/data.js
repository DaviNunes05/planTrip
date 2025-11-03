/*
    data.js
    Helpers de persistência em LocalStorage.
    - Chaves: `pv_trips_local` (viagens) e `pv_user_local` (dados do usuário).
    - Funções: obter, salvar e deletar viagens; obter e salvar usuário.
*/
export const TRIPS_KEY = "pv_trips_local";
export const USER_KEY = "pv_user_local";

export function obterViagens() {
    const raw = localStorage.getItem(TRIPS_KEY);
    return raw ? JSON.parse(raw) : [];
}

export function salvarViagem(viagem) {
    const trips = obterViagens();
    if (viagem.id) {
        const index = trips.findIndex((t) => t.id === viagem.id);
        if (index >= 0) trips[index] = viagem;
        else trips.push(viagem);
    } else {
        viagem.id = Date.now();
        trips.push(viagem);
    }
    localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
    return viagem;
}

export function deletarViagem(id) {
    const trips = obterViagens();
    const filtered = trips.filter((trip) => trip.id !== id);
    localStorage.setItem(TRIPS_KEY, JSON.stringify(filtered));
}

export function obterUsuario() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function salvarUsuario(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}
