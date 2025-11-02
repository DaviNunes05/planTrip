/*
    app.js
    - Lógica principal do Planejador de Viagens
    - Usa Nominatim para geocoding (origem/destino)
    - Calcula distância via fórmula de Haversine
    - Calcula custo estimado de combustível com base nos dados do usuário
    - Persistência: apenas LocalStorage (sem JSON Server)
*/

const TRIPS_KEY = "pv_trips_local";
const USER_KEY = "pv_user_local";

function showToast(message, type = "info", delay = 3000) {
    const container = document.getElementById("toastContainer");
    const toastId = "toast" + Date.now();
    const toast = document.createElement("div");
    toast.className = `toast align-items-center text-bg-${type} border-0`;
    toast.role = "alert";
    toast.ariaLive = "assertive";
    toast.ariaAtomic = "true";
    toast.id = toastId;
    toast.innerHTML = `\n    <div class="d-flex">\n      <div class="toast-body">${message}</div>\n      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>\n    </div>`;
    container.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay });
    bsToast.show();
    toast.addEventListener("hidden.bs.toast", () => toast.remove());
}

// Haversine - distância em km entre duas coordenadas (lat, lon)
function haversine(lat1, lon1, lat2, lon2) {
    console.log("⚙️ Calculando Haversine entre:", lat1, lon1, "e", lat2, lon2);
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Geocode via Nominatim (OpenStreetMap)
async function geocode(query) {
    console.log("🔍 Geocoding para:", query);
    const baseUrl = "https://nominatim.openstreetmap.org/search";
    const params = new URLSearchParams({
        q: query,
        format: "json",
        addressdetails: "1",
        limit: "1",
        countrycodes: "br"
    });
    
    const url = `${baseUrl}?${params.toString()}`;
    try {
        // Em navegadores não é permitido setar o header User-Agent programaticamente.
        // Mantemos Accept-Language para preferir respostas em português.
        const res = await fetch(url, {
            headers: {
                "Accept-Language": "pt-BR"
            }
        });

        if (!res.ok) {
            console.error("Erro na requisição Nominatim:", res.statusText);
            return null;
        }

        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                display_name: data[0].display_name
            };
        }
        return null;
    } catch (err) {
        console.error("Erro ao buscar localização:", err);
        return null;
    }
}

// Buscar endereço a partir do CEP usando ViaCEP
async function buscarEnderecoPorCep(cep) {
    if (!cep) return null;
    // normaliza (apenas dígitos)
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return null;
    const url = `https://viacep.com.br/ws/${digits}/json/`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.erro) return null;
        // monta uma string amigável para geocoding
        const parts = [];
        if (data.logradouro) parts.push(data.logradouro);
        if (data.bairro) parts.push(data.bairro);
        if (data.localidade) parts.push(data.localidade);
        if (data.uf) parts.push(data.uf);
        // ex: "Rua Exemplo, Bairro, Cidade - UF"
        const addr = parts.join(', ');
        return addr || null;
    } catch (e) {
        console.error('Erro ViaCEP:', e);
        return null;
    }
}

async function calcularRotaOSRM(lat1, lon1, lat2, lon2) {
    console.log('🛣️ Calculando rota via OSRM entre:', lat1, lon1, 'e', lat2, lon2);
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
        const res = await fetch(url);
        if (!res.ok) {
            console.warn('OSRM falhou:', res.statusText);
            return null;
        }
        const data = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const distanciaKm = data.routes[0].distance / 1000;
            console.log('✅ Rota calculada via OSRM (estrada):', distanciaKm.toFixed(1), 'km');
            return distanciaKm;
        }
        return null;
    } catch (e) {
        console.warn('Erro no OSRM:', e);
        return null;
    }
}

async function calcularDistancia(origem, destino, apiKey = null) {
    console.log('🚗 Calculando distância entre:', origem, 'e', destino);
    // Helper: detecta se é CEP
    const isCep = (str) => /^\d{5}-?\d{3}$/.test((str || '').replace(/\D/g, ''));
    
    // 1) Resolve CEPs para endereços completos ANTES de qualquer cálculo
    let enderecoOrigem = origem;
    let enderecoDestino = destino;
    
    if (isCep(origem)) {
        const addr = await buscarEnderecoPorCep(origem);
        if (addr) {
            enderecoOrigem = addr;
            console.log('📍 CEP origem resolvido:', addr);
        } else {
            console.warn('⚠️ CEP de origem não encontrado:', origem);
            return null;
        }
    }
    
    if (isCep(destino)) {
        const addr = await buscarEnderecoPorCep(destino);
        if (addr) {
            enderecoDestino = addr;
            console.log('📍 CEP destino resolvido:', addr);
        } else {
            console.warn('⚠️ CEP de destino não encontrado:', destino);
            return null;
        }
    }

    // 2) Busca coordenadas dos endereços
    let origGeo = await geocode(enderecoOrigem);
    let destGeo = await geocode(enderecoDestino);
    
    // Fallback: se não achou, tenta só com cidade/estado
    if (!origGeo && enderecoOrigem.includes(',')) {
        const parts = enderecoOrigem.split(',');
        const cidadeEstado = parts.slice(-2).join(','); // Pega últimas 2 partes
        console.log('🔄 Tentando geocoding simplificado origem:', cidadeEstado);
        origGeo = await geocode(cidadeEstado);
    }
    
    if (!destGeo && enderecoDestino.includes(',')) {
        const parts = enderecoDestino.split(',');
        const cidadeEstado = parts.slice(-2).join(',');
        console.log('🔄 Tentando geocoding simplificado destino:', cidadeEstado);
        destGeo = await geocode(cidadeEstado);
    }
    
    if (!origGeo || !destGeo) {
        console.error('❌ Não conseguiu geocodificar os endereços');
        showToast('Não foi possível localizar origem/destino. Tente informar apenas a cidade.', 'warning', 4000);
        return null;
    }

    console.log('🗺️ Coordenadas obtidas - Origem:', origGeo.lat, origGeo.lon, '| Destino:', destGeo.lat, destGeo.lon);

    // 3) Tenta rota real via OSRM (PRIORIDADE - gratuito e funciona no browser!)
    const distanciaOSRM = await calcularRotaOSRM(origGeo.lat, origGeo.lon, destGeo.lat, destGeo.lon);
    if (distanciaOSRM) {
        return distanciaOSRM;
    }

    // 4) Fallback: Haversine (linha reta - apenas estimativa)
    const distancia = haversine(origGeo.lat, origGeo.lon, destGeo.lat, destGeo.lon);
    console.log('⚠️ Usando distância em linha reta (Haversine):', distancia.toFixed(1), 'km');
    console.log('💡 Real pode ser ~30% maior dependendo da rota');
    return distancia;
}

// --- Persistência (LocalStorage only) ---
function getTrips() {
    const raw = localStorage.getItem(TRIPS_KEY);
    return raw ? JSON.parse(raw) : [];
}

function saveTripToStore(trip) {
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

function deleteTripFromStore(id) {
    const trips = getTrips();
    const filtered = trips.filter((trip) => trip.id !== id);
    localStorage.setItem(TRIPS_KEY, JSON.stringify(filtered));
}

// --- Usuário ---
function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
function saveUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// --- Renderização ---
function formatCurrency(v) {
    return v == null
        ? "R$ 0,00"
        : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function renderTrips(filter = "") {
    const list = document.getElementById("tripsList");
    list.innerHTML = "";
    const trips = getTrips();
    const filtered = trips.filter(
        (t) =>
            (t.destino || "").toLowerCase().includes(filter.toLowerCase()) ||
            (t.origem || "").toLowerCase().includes(filter.toLowerCase())
    );
    if (filtered.length === 0) {
        list.innerHTML = `<div class="col-12"><div class="alert alert-secondary">Nenhuma viagem encontrada.</div></div>`;
        return;
    }
    for (const trip of filtered) {
        const col = document.createElement("div");
        col.className = "col-12 col-sm-6 col-lg-4";
        const img =
            trip.foto || "https://via.placeholder.com/800x450?text=Destino";
        const distanceText = trip.distanciaKm
            ? `${trip.distanciaKm.toFixed(1)} km`
            : "—";
        const total =
            (trip.gHosp || 0) +
            (trip.gAlim || 0) +
            (trip.gOut || 0) +
            (trip.custoCombustivel || 0);
        col.innerHTML = `
      <div class="card h-100 shadow-sm">
        <img src="${img}" class="card-img-top" alt="${trip.destino}">
        <div class="card-body d-flex flex-column">
          <h5 class="card-title">${trip.destino || "—"}</h5>
          <p class="card-text mb-1 small text-muted">Origem: ${
              trip.origem || "—"
          }</p>
          <p class="card-text mb-1">Distância: <strong>${distanceText}</strong></p>
          <p class="card-text mb-3">Valor total estimado: <strong>${formatCurrency(
              total
          )}</strong></p>
          <div class="mt-auto d-flex gap-2">
            <button class="btn btn-sm btn-primary btn-edit" data-id="${
                trip.id
            }"><i class="bi bi-pencil"></i> Editar</button>
            <button class="btn btn-sm btn-outline-danger btn-delete ms-auto" data-id="${
                trip.id
            }"><i class="bi bi-trash"></i> Excluir</button>
          </div>
        </div>
      </div>`;
        list.appendChild(col);
    }
    // attach events
    document.querySelectorAll(".btn-edit").forEach((b) =>
        b.addEventListener("click", async (e) => {
            const id = Number(e.currentTarget.dataset.id);
            await openTripForEdit(id);
        })
    );
    document.querySelectorAll(".btn-delete").forEach((b) =>
        b.addEventListener("click", async (e) => {
            const id = Number(e.currentTarget.dataset.id);
            if (confirm("Excluir esta viagem?")) {
                deleteTripFromStore(id);
                showToast("Viagem excluída", "warning");
                renderTrips(document.getElementById("searchInput").value);
            }
        })
    );
}

// --- Form handlers ---
async function openTripForEdit(id) {
    const trips = getTrips();
    const t = trips.find((x) => x.id === id);
    if (!t) return showToast("Viagem não encontrada", "danger");
    document.getElementById("tripId").value = t.id;
    document.getElementById("destino").value = t.destino || "";
    document.getElementById("cepDestino").value = t.cepDestino || "";
    document.getElementById("origem").value = t.origem || "";
    document.getElementById("foto").value = t.foto || "";
    document.getElementById("gHospedagem").value = t.gHosp || 0;
    document.getElementById("gAlimentacao").value = t.gAlim || 0;
    document.getElementById("gOutros").value = t.gOut || 0;
    if (t.transporte === "passagem")
        document.getElementById("modoPassagem").checked = true;
    else document.getElementById("modoVeiculo").checked = true;
    // preencher info de distância/custo
    document.getElementById("distanciaTxt").innerText = t.distanciaKm
        ? `${t.distanciaKm.toFixed(1)} km`
        : "—";
    document.getElementById("combustivelTxt").innerText = t.custoCombustivel
        ? formatCurrency(t.custoCombustivel)
        : "—";
    // abrir modal
    const modalEl = document.getElementById("tripModal");
    const bs = new bootstrap.Modal(modalEl);
    bs.show();
}

async function handleTripFormSubmit(ev) {
    ev.preventDefault();
    const id = document.getElementById("tripId").value
        ? Number(document.getElementById("tripId").value)
        : null;
    const destino = document.getElementById("destino").value.trim();
    const origem = document.getElementById("origem").value.trim();
    const foto = document.getElementById("foto").value.trim();
    const transporte = document.querySelector(
        'input[name="transporte"]:checked'
    ).value;
    const gHosp = Number(document.getElementById("gHospedagem").value) || 0;
    const gAlim = Number(document.getElementById("gAlimentacao").value) || 0;
    const gOut = Number(document.getElementById("gOutros").value) || 0;

    // criação do objeto
    const cepDestino = document.getElementById('cepDestino').value.trim();
    const trip = { id, destino, origem, foto, transporte, gHosp, gAlim, gOut, cepDestino };

    // Calcular distância e custo de combustível quando possível (somente para veículo próprio)
    const user = getUser();
    if (transporte === "veiculo" && user) {
        // primeiro tentamos obter distância por estrada (OSRM)
        // priorizamos o CEP do destino para gerar um endereço mais preciso
        const destinoParaRota = cepDestino || destino;
        // Tenta Google Directions (se houver apiKey) e, se não disponível, usa fallback genérico
        let km = await calcularDistancia(origem, destinoParaRota, user.googleApiKey);
        // se falhar, fallback para geocoding + Haversine (linha reta)
        if (km == null) {
            const origGeo = await geocode(origem);
            const destGeo = await geocode(destino);
            if (origGeo && destGeo) {
                km = haversine(origGeo.lat, origGeo.lon, destGeo.lat, destGeo.lon);
            }
        }
        if (km != null) {
            trip.distanciaKm = km;
            const consumo = user.kmPorLitro || 1; // evita divisão por zero
            const litros = km / consumo;
            const custoComb = litros * (user.precoLitro || 0);
            trip.custoCombustivel = Number(custoComb.toFixed(2));
        }
    }

    const saved = saveTripToStore(trip);
    showToast("Viagem salva", "success");
    // fechar modal
    const tripModalEl = document.getElementById("tripModal");
    bootstrap.Modal.getInstance(tripModalEl)?.hide();
    // re-render
    renderTrips(document.getElementById("searchInput").value);
}

// --- User form ---
function handleUserFormSubmit(ev) {
    ev.preventDefault();
    const kmPorLitro = Number(document.getElementById("kmPorLitro").value) || 0;
    const precoLitro = Number(document.getElementById("precoLitro").value) || 0;
    const capacidadeTanque =
        Number(document.getElementById("capacidadeTanque").value) || null;
    const googleApiKey = document.getElementById('googleApiKey')?.value?.trim() || null;
    const user = { kmPorLitro, precoLitro, capacidadeTanque };
    if (googleApiKey) user.googleApiKey = googleApiKey;
    saveUser(user);
    showToast("Dados do usuário salvos", "success");
    bootstrap.Modal.getInstance(document.getElementById("userModal"))?.hide();
}

// --- Inicialização e binds ---
async function init() {
    // preencher dados do usuário no modal
    const u = getUser();
    if (u) {
        document.getElementById("kmPorLitro").value = u.kmPorLitro;
        document.getElementById("precoLitro").value = u.precoLitro;
        document.getElementById("capacidadeTanque").value =
            u.capacidadeTanque || "";
        document.getElementById("googleApiKey").value = u.googleApiKey || '';
    } else {
        // valores padrão sugeridos
        document.getElementById("kmPorLitro").value = 10;
        document.getElementById("precoLitro").value = 5.5;
    }

    document
        .getElementById("tripForm")
        .addEventListener("submit", handleTripFormSubmit);
    document
        .getElementById("userForm")
        .addEventListener("submit", handleUserFormSubmit);
    // Quando o usuário preencher o CEP do destino, tentamos buscar endereço via ViaCEP
    const cepDestinoInput = document.getElementById('cepDestino');
    if (cepDestinoInput) {
        cepDestinoInput.addEventListener('blur', async (e) => {
            const cep = e.target.value.trim();
            if (!cep) return;
            const endereco = await buscarEnderecoPorCep(cep);
            if (endereco) {
                // só preenche o título destino se estiver vazio
                const destInput = document.getElementById('destino');
                if (destInput && (!destInput.value || destInput.value.trim() === '')) {
                    destInput.value = endereco;
                }
                showToast('Endereço obtido pelo CEP e aplicado no campo destino (se vazio)', 'success', 2000);
            } else {
                showToast('CEP não encontrado (ViaCEP)', 'warning', 2500);
            }
        });
    }
    document.getElementById("btnNewTrip").addEventListener("click", () => {
        // limpar form para novo registro
        document.getElementById("tripForm").reset();
        document.getElementById("tripId").value = "";
        document.getElementById("distanciaTxt").innerText = "—";
        document.getElementById("combustivelTxt").innerText = "—";
    });

    document
        .getElementById("searchInput")
        .addEventListener("input", (e) => renderTrips(e.target.value));
    document.getElementById("btnClear").addEventListener("click", () => {
        document.getElementById("searchInput").value = "";
        renderTrips("");
    });

    // initial render
    await renderTrips();
    showToast("Aplicação pronta", "info", 1500);
}

// roda init quando DOM estiver pronto
window.addEventListener("DOMContentLoaded", init);
