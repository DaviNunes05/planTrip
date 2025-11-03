/* tripsUI.js
   Funções relacionadas à renderização da lista de viagens e controle do modal de edição.
*/
import { obterViagens, deletarViagem, salvarViagem } from "./data.js";
import {
    formatarMoeda,
    formatarData,
    popularDespesas,
    lerDespesasDoDOM,
    definirCalculando,
    mostrarToast,
} from "./ui.js";
import { calcularDistancia } from "./services.js";

export async function renderizarViagens(filter = "") {
    const list = document.getElementById("tripsList");
    list.innerHTML = "";
    const trips = obterViagens();
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
        const img = (trip.foto && trip.foto.toString().trim())
            ? trip.foto
            : "img/default-destination.svg";
        const distanceText = trip.distanciaKm
            ? `${trip.distanciaKm.toFixed(1)} km`
            : "—";
        const dataIdaTxt = trip.dataIda ? formatarData(trip.dataIda) : "";
        const dataVoltaTxt = trip.dataVolta ? formatarData(trip.dataVolta) : "";
        const daysTxt = trip.days != null ? String(trip.days) : "";
        let despesasTotal = 0;
        if (Array.isArray(trip.expenses)) {
            despesasTotal = trip.expenses.reduce((totalAcumulado, despesa) => {
            const valorDespesa = Number(despesa.value) || 0;
            return totalAcumulado + valorDespesa;
            }, 0);
        }
        const total = despesasTotal + (trip.custoCombustivel || 0);
        const origResolved = trip.resolved?.orig;
        const destResolved = trip.resolved?.dest;
        const origResolvedTxt = origResolved
            ? `${origResolved.cep ? origResolved.cep + " — " : ""}${
                  origResolved.bairro ? origResolved.bairro + ", " : ""
              }${origResolved.cidade ? origResolved.cidade + " - " : ""}${
                  origResolved.uf || ""
              }`
            : "";
        const destResolvedTxt = destResolved
            ? `${destResolved.cep ? destResolved.cep + " — " : ""}${
                  destResolved.bairro ? destResolved.bairro + ", " : ""
              }${destResolved.cidade ? destResolved.cidade + " - " : ""}${
                  destResolved.uf || ""
              }`
            : "";
        col.innerHTML = `
            <div class="card h-100 shadow-sm">
                <img src="${img}" class="card-img-top" alt="${trip.destino}">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title">${trip.destino || "—"} ${trip.realizada ? '<span class="badge bg-success ms-2">Realizada</span>' : ''}</h5>
                    ${
                        dataIdaTxt || dataVoltaTxt
                            ? `<p class="card-text mb-1 small text-muted">Datas: ${
                                  dataIdaTxt ? dataIdaTxt : "—"
                              } ${dataVoltaTxt ? "→ " + dataVoltaTxt : ""} ${
                                  daysTxt ? "(" + daysTxt + " dias)" : ""
                              }</p>`
                            : ""
                    }
                    <p class="card-text mb-1 small text-muted">Destino: ${
                        destResolvedTxt || trip.destino || "—"
                    }</p>
                    <p class="card-text mb-1 small text-muted">Origem: ${
                        origResolvedTxt || trip.origem || "—"
                    }</p>
                    <p class="card-text mb-1">Distância: <strong>${distanceText}</strong></p>
                    <p class="card-text mb-3">Valor total estimado: <strong>${formatarMoeda(
                        total
                    )}</strong></p>
                                <div class="mt-auto d-flex gap-2">
                                    <button class="btn btn-sm btn-success btn-done" data-id="${trip.id}" title="Marcar como realizada">${trip.realizada ? '<i class="bi bi-check2-circle"></i> Feita' : '<i class="bi bi-check2"></i> Marcar feita'}</button>
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
        col.addEventListener("click", (e) => {
            if (
                e.target.closest(".btn-edit") ||
                e.target.closest(".btn-delete")
            )
                return;
            abrirViagemParaEditar(trip.id);
        });
        const btnDone = col.querySelector('.btn-done');
        if (btnDone) {
            btnDone.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const id = Number(ev.currentTarget.dataset.id);
                const trips = obterViagens();
                const t = trips.find(x => x.id === id);
                if (!t) return mostrarToast('Viagem não encontrada', 'danger');
                t.realizada = !t.realizada;
                salvarViagem(t);
                mostrarToast(t.realizada ? 'Viagem marcada como realizada' : 'Marca de viagem removida', 'info');
                const filtro = document.getElementById('searchInput')?.value || '';
                renderizarViagens(filtro);
            });
        }
    }
    document.querySelectorAll(".btn-edit").forEach((b) =>
        b.addEventListener("click", async (e) => {
            const id = Number(e.currentTarget.dataset.id);
            await abrirViagemParaEditar(id);
        })
    );
    document.querySelectorAll(".btn-delete").forEach((b) =>
        b.addEventListener("click", async (e) => {
            const id = Number(e.currentTarget.dataset.id);
            if (confirm("Excluir esta viagem?")) {
                deletarViagem(id);
                mostrarToast("Viagem excluída", "warning");
                renderizarViagens(document.getElementById("searchInput").value);
            }
        })
    );
}

export async function abrirViagemParaEditar(id) {
    const trips = obterViagens();
    const t = trips.find((x) => x.id === id);
    if (!t) return mostrarToast("Viagem não encontrada", "danger");
    document.getElementById("tripId").value = t.id;
    document.getElementById("destino").value = t.destino || "";
    document.getElementById("cepDestino").value = t.cepDestino || "";
    document.getElementById("origem").value = t.origem || "";
    document.getElementById("foto").value = t.foto || "";
    popularDespesas(t.expenses || []);
    if (t.transporte === "passagem")
        document.getElementById("modoPassagem").checked = true;
    else document.getElementById("modoVeiculo").checked = true;
    document.getElementById("distanciaTxt").innerText = t.distanciaKm
        ? `${t.distanciaKm.toFixed(1)} km`
        : "—";
    document.getElementById("combustivelTxt").innerText = t.custoCombustivel
        ? formatarMoeda(t.custoCombustivel)
        : "—";
    const destResolvedEl = document.getElementById("destResolved");
    const origResolvedEl = document.getElementById("origResolved");
    if (destResolvedEl) {
        const d = t.resolved?.dest;
        destResolvedEl.innerText = d
            ? `${d.cep ? d.cep + " — " : ""}${d.bairro ? d.bairro + ", " : ""}${
                  d.cidade ? d.cidade + " - " : ""
              }${d.uf || ""}`
            : "";
    }
    if (origResolvedEl) {
        const o = t.resolved?.orig;
        origResolvedEl.innerText = o
            ? `${o.cep ? o.cep + " — " : ""}${o.bairro ? o.bairro + ", " : ""}${
                  o.cidade ? o.cidade + " - " : ""
              }${o.uf || ""}`
            : "";
    }
    const dataIdaEl = document.getElementById("dataIda");
    const dataVoltaEl = document.getElementById("dataVolta");
    const diasTxtEl = document.getElementById("diasTxt");
    if (dataIdaEl) dataIdaEl.value = t.dataIda || "";
    if (dataVoltaEl) dataVoltaEl.value = t.dataVolta || "";
    if (diasTxtEl) diasTxtEl.innerText = t.days != null ? String(t.days) : "—";
    const modalEl = document.getElementById("tripModal");
    const bs = bootstrap.Modal.getOrCreateInstance(modalEl);
    bs.show();
}

export async function tratarEnvioFormularioViagem(ev) {
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
    const cepDestino = document.getElementById("cepDestino").value.trim();
    const expenses = lerDespesasDoDOM();
    const dataIda = document.getElementById("dataIda")?.value || null;
    const dataVolta = document.getElementById("dataVolta")?.value || null;
    let days = null;
    if (dataIda && dataVolta) {
        const d1 = new Date(dataIda);
        const d2 = new Date(dataVolta);
        const diff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
        days = diff >= 0 ? diff + 1 : null;
    }
    const trip = {
        id,
        destino,
        origem,
        foto,
        transporte,
        expenses,
        cepDestino,
        dataIda,
        dataVolta,
        days,
    };
    const userRaw = localStorage.getItem("pv_user_local");
    const user = userRaw ? JSON.parse(userRaw) : null;
    if (transporte === "veiculo" && user) {
        const destinoParaRota = cepDestino || destino;
        definirCalculando(true);
        try {
            const res = await calcularDistancia(origem, destinoParaRota);
            if (res) {
                if (res.origResolved || res.destResolved) {
                    trip.resolved = {
                        orig: res.origResolved || null,
                        dest: res.destResolved || null,
                    };
                }
                if (res.km == null) {
                    mostrarToast(
                        "Distância não obtida — combustível não calculado. Você pode salvar a viagem mesmo assim.",
                        "warning",
                        4000
                    );
                } else {
                    trip.distanciaKm = res.km;
                    const consumo = user.kmPorLitro || 1;
                    const litros = res.km / consumo;
                    const custoComb = litros * (user.precoLitro || 0);
                    trip.custoCombustivel = Number(custoComb.toFixed(2));
                }
            } else {
                mostrarToast("Erro ao calcular distância.", "warning", 3000);
            }
        } finally {
            definirCalculando(false);
        }
    }
    salvarViagem(trip);
    mostrarToast("Viagem salva", "success");
    const tripModalEl = document.getElementById("tripModal");
    bootstrap.Modal.getInstance(tripModalEl)?.hide();
    document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
    document.body.classList.remove("modal-open");
    renderizarViagens(document.getElementById("searchInput").value);
}
