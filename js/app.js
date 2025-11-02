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

/**
 * showToast(message, type = "info", delay = 3000)
 * Exibe uma mensagem (toast) usando Bootstrap.
 * - message: texto a mostrar
 * - type: estilo (info, success, warning, danger)
 * - delay: tempo em ms para auto-fechar
 */
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

// função haversine removida — o fluxo agora depende de OSRM para rotas por estrada


/**
 * geocode(query)
 * Consulta o Nominatim (OpenStreetMap) para obter coordenadas a partir de uma string.
 * Retorna { lat, lon, display_name } ou null.
 */
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
                    display_name: data[0].display_name,
                    address: data[0].address || {}
                };
        }
        return null;
    } catch (err) {
        console.error("Erro ao buscar localização:", err);
        return null;
    }
}

/**
 * buscarEnderecoPorCep(cep)
 * Consulta a API ViaCEP e retorna uma string de endereço pronta para geocoding
 * (ex: 'Rua X, Bairro, Cidade, UF') ou null em caso de erro.
 */
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
        // monta um objeto estruturado com informações úteis
        const obj = {
            cep: digits,
            logradouro: data.logradouro || '',
            bairro: data.bairro || '',
            localidade: data.localidade || '',
            uf: data.uf || '',
        };
        obj.formatted = [obj.logradouro, obj.bairro, obj.localidade, obj.uf].filter(Boolean).join(', ');
        return obj;
    } catch (e) {
        console.error('Erro ViaCEP:', e);
        return null;
    }
}

/**
 * calcularRotaOSRM(lat1, lon1, lat2, lon2)
 * Tenta obter distância por estrada via OSRM (gratuito). Retorna km ou null.
 */
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

/**
 * calcularDistancia(origem, destino)
 * Função principal para obter distância entre duas strings (CEP ou endereço).
 * Tenta obter rota por estrada via OSRM. Se não for possível obter rota por estrada,
 * retorna null (não faz fallback por linha reta nesta versão).
 * Retorna número (km) ou null.
 */
async function calcularDistancia(origem, destino) {
    console.log('🚗 Calculando distância entre:', origem, 'e', destino);
    // Helper: detecta se é CEP
    const isCep = (str) => /^\d{5}-?\d{3}$/.test((str || '').replace(/\D/g, ''));
    
    // 1) Resolve CEPs para endereços completos ANTES de qualquer cálculo
    let enderecoOrigem = origem;
    let enderecoDestino = destino;
    let resolvedOrig = null;
    let resolvedDest = null;

    if (isCep(origem)) {
        const addrObj = await buscarEnderecoPorCep(origem);
        if (addrObj) {
            enderecoOrigem = addrObj.formatted || enderecoOrigem;
            resolvedOrig = {
                cep: addrObj.cep,
                bairro: addrObj.bairro,
                cidade: addrObj.localidade,
                uf: addrObj.uf,
                full: addrObj.formatted,
            };
            console.log('📍 CEP origem resolvido:', addrObj);
        } else {
            console.warn('⚠️ CEP de origem não encontrado:', origem);
            return null;
        }
    }

    if (isCep(destino)) {
        const addrObj = await buscarEnderecoPorCep(destino);
        if (addrObj) {
            enderecoDestino = addrObj.formatted || enderecoDestino;
            resolvedDest = {
                cep: addrObj.cep,
                bairro: addrObj.bairro,
                cidade: addrObj.localidade,
                uf: addrObj.uf,
                full: addrObj.formatted,
            };
            console.log('📍 CEP destino resolvido:', addrObj);
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
    // preencher resolved a partir do geocode caso ainda não tenhamos vindo do ViaCEP
    const extractFromGeo = (geo) => {
        if (!geo) return null;
        const a = geo.address || {};
        const bairro = a.neighbourhood || a.suburb || a.village || a.hamlet || a.quarter || '';
        const cidade = a.city || a.town || a.village || a.county || '';
        const uf = a.state || a.region || '';
        const cep = a.postcode || null;
        const full = [bairro, cidade, uf].filter(Boolean).join(', ');
        return { cep, bairro, cidade, uf, full: full || geo.display_name };
    };
    if (!resolvedOrig) resolvedOrig = extractFromGeo(origGeo);
    if (!resolvedDest) resolvedDest = extractFromGeo(destGeo);

    // 3) Tenta rota real via OSRM (prioridade - gratuito e funciona no browser)
    const distanciaOSRM = await calcularRotaOSRM(origGeo.lat, origGeo.lon, destGeo.lat, destGeo.lon);
    if (distanciaOSRM) {
        return { km: distanciaOSRM, origResolved: resolvedOrig, destResolved: resolvedDest };
    }

    // Se OSRM falhar, não fazemos mais fallback por Haversine — apenas notificamos
    console.warn('⚠️ Não foi possível obter rota via OSRM para esses pontos');
    showToast('Não foi possível calcular rota por estrada; verifique origem/CEP e tente novamente.', 'warning', 4000);
    return { km: null, origResolved: resolvedOrig, destResolved: resolvedDest };
}

// --- Persistência (LocalStorage only) ---
/**
 * getTrips()
 * Retorna array de viagens salvas no LocalStorage.
 */
function getTrips() {
    const raw = localStorage.getItem(TRIPS_KEY);
    return raw ? JSON.parse(raw) : [];
}

/**
 * saveTripToStore(trip)
 * Salva ou atualiza uma viagem no LocalStorage. Garante um id único.
 */
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

/**
 * deleteTripFromStore(id)
 * Remove viagem por id do LocalStorage.
 */
function deleteTripFromStore(id) {
    const trips = getTrips();
    const filtered = trips.filter((trip) => trip.id !== id);
    localStorage.setItem(TRIPS_KEY, JSON.stringify(filtered));
}

// --- Usuário ---
/**
 * getUser()
 * Recupera os dados do usuário (kmPorLitro, precoLitro, capacidadeTanque)
 * ou retorna null.
 */
function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
/**
 * saveUser(user)
 * Salva no LocalStorage os dados do usuário.
 */
function saveUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// --- Renderização ---
/**
 * formatCurrency(v)
 * Formata número para moeda BRL (pt-BR).
 */
function formatCurrency(v) {
    return v == null
        ? "R$ 0,00"
        : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * formatDate(iso)
 * Formata uma data ISO (YYYY-MM-DD) para dd/mm/YYYY.
 */
function formatDate(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    } catch {
        return iso;
    }
}

// --- Gerenciamento de despesas dinâmicas no formulário ---
/**
 * createExpenseRow(nome, valor)
 * Cria e retorna um elemento DOM representando uma linha de despesa (nome + valor + remover).
 */
function createExpenseRow(nome = "", valor = 0) {
    const row = document.createElement('div');
    row.className = 'd-flex gap-2 mb-2 align-items-center expense-row';
    row.innerHTML = `
        <input type="text" class="form-control form-control-sm expense-name" placeholder="Descrição" value="${nome}">
        <input type="number" step="0.01" min="0" class="form-control form-control-sm expense-value" placeholder="0.00" value="${Number(valor).toFixed(2)}">
        <button type="button" class="btn btn-sm btn-outline-danger btn-remove-expense" title="Remover">&times;</button>
    `;
    // remover handler
    row.querySelector('.btn-remove-expense').addEventListener('click', () => {
        row.remove();
        updateExpensesTotalDisplay();
    });
    // atualizar total quando valor mudar
    row.querySelector('.expense-value').addEventListener('input', () => updateExpensesTotalDisplay());
    row.querySelector('.expense-name').addEventListener('input', () => {});
    return row;
}

/**
 * readExpensesFromDOM()
 * Lê as linhas de despesas no modal e retorna um array [{name, value}, ...]
 */
function readExpensesFromDOM() {
    const container = document.getElementById('expensesList');
    const items = [];
    if (!container) return items;
    container.querySelectorAll('.expense-row').forEach((r) => {
        const name = r.querySelector('.expense-name')?.value?.trim() || '';
        const value = parseFloat(r.querySelector('.expense-value')?.value || 0) || 0;
        if (name || value) items.push({ name, value });
    });
    return items;
}

/**
 * updateExpensesTotalDisplay()
 * Soma os valores das despesas no DOM e atualiza o texto do total.
 */
function updateExpensesTotalDisplay() {
    const items = readExpensesFromDOM();
    const sum = items.reduce((s, it) => s + (Number(it.value) || 0), 0);
    const el = document.getElementById('despesasTotalTxt');
    if (el) el.innerText = formatCurrency(sum);
    return sum;
}

/**
 * populateExpenses(items)
 * Preenche o container de despesas com os itens fornecidos.
 */
function populateExpenses(items = []) {
    const container = document.getElementById('expensesList');
    if (!container) return;
    container.innerHTML = '';
    for (const it of items) {
        const row = createExpenseRow(it.name, it.value || 0);
        container.appendChild(row);
    }
    updateExpensesTotalDisplay();
}

/**
 * setCalculating(loading)
 * Mostra/oculta o spinner de cálculo e habilita/desabilita o botão de submit do formulário de viagem.
 */
function setCalculating(loading = true) {
    const spinner = document.getElementById('calcSpinner');
    if (spinner) {
        if (loading) spinner.classList.remove('d-none');
        else spinner.classList.add('d-none');
    }
    const submitBtn = document.querySelector('#tripForm button[type="submit"]');
    if (submitBtn) submitBtn.disabled = loading;
}

/**
 * renderTrips(filter = "")
 * Renderiza os cards de viagens na tela, aplicando um filtro por destino/origem.
 */
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
        const dataIdaTxt = trip.dataIda ? formatDate(trip.dataIda) : '';
        const dataVoltaTxt = trip.dataVolta ? formatDate(trip.dataVolta) : '';
        const daysTxt = trip.days != null ? String(trip.days) : '';
        // soma de despesas (itens) + combustível
        let despesasTotal = 0;
        if (Array.isArray(trip.expenses)) {
            despesasTotal = trip.expenses.reduce((s, it) => s + (Number(it.value) || 0), 0);
        }
                const total = despesasTotal + (trip.custoCombustivel || 0);
                const origResolved = trip.resolved?.orig;
                const destResolved = trip.resolved?.dest;
                const origResolvedTxt = origResolved ? `${origResolved.cep ? origResolved.cep + ' — ' : ''}${origResolved.bairro ? origResolved.bairro + ', ' : ''}${origResolved.cidade ? origResolved.cidade + ' - ' : ''}${origResolved.uf || ''}` : '';
                const destResolvedTxt = destResolved ? `${destResolved.cep ? destResolved.cep + ' — ' : ''}${destResolved.bairro ? destResolved.bairro + ', ' : ''}${destResolved.cidade ? destResolved.cidade + ' - ' : ''}${destResolved.uf || ''}` : '';
                col.innerHTML = `
            <div class="card h-100 shadow-sm">
                <img src="${img}" class="card-img-top" alt="${trip.destino}">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title">${trip.destino || "—"}</h5>
                    ${dataIdaTxt || dataVoltaTxt ? `<p class="card-text mb-1 small text-muted">Datas: ${dataIdaTxt ? dataIdaTxt : '—'} ${dataVoltaTxt ? '→ ' + dataVoltaTxt : ''} ${daysTxt ? '(' + daysTxt + ' dias)' : ''}</p>` : ''}
                    <p class="card-text mb-1 small text-muted">Destino: ${destResolvedTxt || trip.destino || '—'}</p>
                    <p class="card-text mb-1 small text-muted">Origem: ${origResolvedTxt || trip.origem || '—'}</p>
                    <p class="card-text mb-1">Distância: <strong>${distanceText}</strong></p>
                    <p class="card-text mb-3">Valor total estimado: <strong>${formatCurrency(
                            total
                    )}</strong></p>
                                <div class="mt-auto d-flex gap-2">
                                    <button class="btn btn-sm btn-primary btn-edit" data-id="${trip.id}"><i class="bi bi-pencil"></i> Editar</button>
                                    <button class="btn btn-sm btn-outline-danger btn-delete ms-auto" data-id="${trip.id}"><i class="bi bi-trash"></i> Excluir</button>
                                </div>
                </div>
            </div>`;
        list.appendChild(col);
        // abrir modal ao clicar em qualquer parte do card (exceto botões Editar/Excluir)
        col.addEventListener('click', (e) => {
            if (e.target.closest('.btn-edit') || e.target.closest('.btn-delete')) return;
            openTripForEdit(trip.id);
        });
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
/**
 * openTripForEdit(id)
 * Abre o modal de edição preenchido com os dados da viagem selecionada.
 */
async function openTripForEdit(id) {
    const trips = getTrips();
    const t = trips.find((x) => x.id === id);
    if (!t) return showToast("Viagem não encontrada", "danger");
    document.getElementById("tripId").value = t.id;
    document.getElementById("destino").value = t.destino || "";
    document.getElementById("cepDestino").value = t.cepDestino || "";
    document.getElementById("origem").value = t.origem || "";
    document.getElementById("foto").value = t.foto || "";
    // popular lista de despesas (se houver)
    populateExpenses(t.expenses || []);
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
    // preencher campos resumidos de endereço resolvido (se houver)
    const destResolvedEl = document.getElementById('destResolved');
    const origResolvedEl = document.getElementById('origResolved');
    if (destResolvedEl) {
        const d = t.resolved?.dest;
        destResolvedEl.innerText = d ? `${d.cep ? d.cep + ' — ' : ''}${d.bairro ? d.bairro + ', ' : ''}${d.cidade ? d.cidade + ' - ' : ''}${d.uf || ''}` : '';
    }
    if (origResolvedEl) {
        const o = t.resolved?.orig;
        origResolvedEl.innerText = o ? `${o.cep ? o.cep + ' — ' : ''}${o.bairro ? o.bairro + ', ' : ''}${o.cidade ? o.cidade + ' - ' : ''}${o.uf || ''}` : '';
    }
    // preencher datas e dias
    const dataIdaEl = document.getElementById('dataIda');
    const dataVoltaEl = document.getElementById('dataVolta');
    const diasTxtEl = document.getElementById('diasTxt');
    if (dataIdaEl) dataIdaEl.value = t.dataIda || '';
    if (dataVoltaEl) dataVoltaEl.value = t.dataVolta || '';
    if (diasTxtEl) diasTxtEl.innerText = t.days != null ? String(t.days) : '—';
    // abrir modal
    const modalEl = document.getElementById("tripModal");
    const bs = bootstrap.Modal.getOrCreateInstance(modalEl);
    bs.show();
}

/**
 * handleTripFormSubmit(ev)
 * Handler para submissão do formulário de viagem. Calcula distância/custo e salva a viagem.
 */
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
    // leitura das despesas dinâmicas
    const cepDestino = document.getElementById('cepDestino').value.trim();
    const expenses = readExpensesFromDOM();
    const dataIda = document.getElementById('dataIda')?.value || null;
    const dataVolta = document.getElementById('dataVolta')?.value || null;
    // calcular dias (inclusivo se ambas datas presentes)
    let days = null;
    if (dataIda && dataVolta) {
        const d1 = new Date(dataIda);
        const d2 = new Date(dataVolta);
        const diff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
        days = diff >= 0 ? diff + 1 : null; // se volta antes da ida, deixa null
    }
    const trip = { id, destino, origem, foto, transporte, expenses, cepDestino, dataIda, dataVolta, days };

    // Calcular distância e custo de combustível quando possível (somente para veículo próprio)
    const user = getUser();
    if (transporte === "veiculo" && user) {
        // primeiro tentamos obter distância por estrada (OSRM)
        // priorizamos o CEP do destino para gerar um endereço mais preciso
        const destinoParaRota = cepDestino || destino;
        // indica que estamos calculando e impede múltiplos envios
        setCalculating(true);
        try {
            const res = await calcularDistancia(origem, destinoParaRota);
            if (res) {
                // salvar dados resolvidos (origem/destino) se disponíveis
                if (res.origResolved || res.destResolved) {
                    trip.resolved = {
                        orig: res.origResolved || null,
                        dest: res.destResolved || null,
                    };
                }
                if (res.km == null) {
                    showToast('Distância não obtida — combustível não calculado. Você pode salvar a viagem mesmo assim.', 'warning', 4000);
                } else {
                    trip.distanciaKm = res.km;
                    const consumo = user.kmPorLitro || 1; // evita divisão por zero
                    const litros = res.km / consumo;
                    const custoComb = litros * (user.precoLitro || 0);
                    trip.custoCombustivel = Number(custoComb.toFixed(2));
                }
            } else {
                showToast('Erro ao calcular distância.', 'warning', 3000);
            }
        } finally {
            setCalculating(false);
        }
    }

    const saved = saveTripToStore(trip);
    showToast("Viagem salva", "success");
    // fechar modal (usar instância existente) e limpar possíveis vestígios de backdrop
    const tripModalEl = document.getElementById("tripModal");
    bootstrap.Modal.getInstance(tripModalEl)?.hide();
    // limpeza defensiva: remover quaisquer backdrops remanescentes e a classe modal-open
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    // re-render
    renderTrips(document.getElementById("searchInput").value);
}

// --- User form ---
/**
 * handleUserFormSubmit(ev)
 * Handler para submissão do formulário de dados do usuário. Salva consumo, preço e API key.
 */
function handleUserFormSubmit(ev) {
    ev.preventDefault();
    const kmPorLitro = Number(document.getElementById("kmPorLitro").value) || 0;
    const precoLitro = Number(document.getElementById("precoLitro").value) || 0;
    const capacidadeTanque =
        Number(document.getElementById("capacidadeTanque").value) || null;
    const user = { kmPorLitro, precoLitro, capacidadeTanque };
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
            const cepObj = await buscarEnderecoPorCep(cep);
            if (cepObj) {
                // só preenche o título destino com Bairro, Cidade - UF se estiver vazio
                const destInput = document.getElementById('destino');
                const short = [cepObj.bairro, cepObj.localidade, cepObj.uf].filter(Boolean).join(', ');
                if (destInput && (!destInput.value || destInput.value.trim() === '')) {
                    destInput.value = short;
                }
                // mostrar no campo de destino resolvido
                const destResolvedEl = document.getElementById('destResolved');
                if (destResolvedEl) destResolvedEl.innerText = `${cepObj.cep} — ${short}`;
                showToast('Endereço obtido pelo CEP e aplicado no campo destino (se vazio)', 'success', 2000);
            } else {
                showToast('CEP não encontrado (ViaCEP)', 'warning', 2500);
            }
        });
    }
    // quando o usuário preencher a origem, tentamos extrair Bairro/Cidade/UF via Nominatim para exibição
    const origemInput = document.getElementById('origem');
    if (origemInput) {
        origemInput.addEventListener('blur', async (e) => {
            const q = e.target.value.trim();
            if (!q) return;
            const geo = await geocode(q);
            const origResolvedEl = document.getElementById('origResolved');
            if (geo && geo.address) {
                const a = geo.address;
                const bairro = a.neighbourhood || a.suburb || a.village || a.hamlet || '';
                const cidade = a.city || a.town || a.village || a.county || '';
                const uf = a.state || a.region || '';
                const cep = a.postcode || '';
                const short = [bairro, cidade, uf].filter(Boolean).join(', ');
                if (origResolvedEl) origResolvedEl.innerText = `${cep ? cep + ' — ' : ''}${short}`;
            } else if (origResolvedEl) {
                origResolvedEl.innerText = '';
            }
        });
    }
    // botões e comportamento da lista de despesas
    const btnAddExpense = document.getElementById('btnAddExpense');
    if (btnAddExpense) {
        btnAddExpense.addEventListener('click', () => {
            const container = document.getElementById('expensesList');
            const row = createExpenseRow('', 0);
            container.appendChild(row);
            updateExpensesTotalDisplay();
        });
    }
    // Função centralizada para abrir o modal e limpar o formulário
    function openNewTripModal() {
        // limpar form para novo registro
        const form = document.getElementById("tripForm");
        form?.reset();
        document.getElementById("tripId").value = "";
        document.getElementById("distanciaTxt").innerText = "—";
        document.getElementById("combustivelTxt").innerText = "—";
        // limpar lista de despesas
        populateExpenses([]);
        // limpar campos de endereço resolvido
        const destResolvedEl = document.getElementById('destResolved');
        const origResolvedEl = document.getElementById('origResolved');
        if (destResolvedEl) destResolvedEl.innerText = '';
        if (origResolvedEl) origResolvedEl.innerText = '';
        // abrir o modal explicitamente
        const modalEl = document.getElementById('tripModal');
        if (modalEl) {
                const bs = bootstrap.Modal.getOrCreateInstance(modalEl);
                bs.show();
            }
    }

    // Anexa handlers de forma robusta ao botão flutuante
    const btnFloating = document.getElementById('btnNewTrip');
    if (btnFloating) {
        try {
            btnFloating.type = 'button';
        } catch {}
        // event listener padrão
        btnFloating.addEventListener('click', (e) => {
            e.preventDefault();
            openNewTripModal();
        });
        // garantir onclick como fallback
        btnFloating.onclick = (e) => { e.preventDefault(); openNewTripModal(); };
        // garantir que o botão aceite clicks
        btnFloating.style.pointerEvents = 'auto';
    }

    // Delegated fallback: captura cliques no documento para o seletor '#btnNewTrip'
    document.body.addEventListener('click', (e) => {
        const el = e.target && e.target.closest ? e.target.closest('#btnNewTrip') : null;
        if (el) {
            e.preventDefault();
            openNewTripModal();
        }
    });

    // atualizar dias quando datas mudarem
    const dataIdaEl = document.getElementById('dataIda');
    const dataVoltaEl = document.getElementById('dataVolta');
    const diasTxtEl = document.getElementById('diasTxt');
    const updateDays = () => {
        const d1 = dataIdaEl?.value ? new Date(dataIdaEl.value) : null;
        const d2 = dataVoltaEl?.value ? new Date(dataVoltaEl.value) : null;
        if (d1 && d2) {
            const diff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
            const days = diff >= 0 ? diff + 1 : null;
            diasTxtEl && (diasTxtEl.innerText = days != null ? String(days) : '—');
        } else {
            diasTxtEl && (diasTxtEl.innerText = '—');
        }
    };
    if (dataIdaEl) dataIdaEl.addEventListener('change', updateDays);
    if (dataVoltaEl) dataVoltaEl.addEventListener('change', updateDays);

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
