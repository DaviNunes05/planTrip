/*
    app.js
    Ponto de entrada (entrypoint) da aplicação.
    - Inicializa o módulo de usuário (modal "Meus dados").
    - Registra listeners globais (formulário de viagem, busca por CEP, botão 'Nova viagem', dias entre datas, adicionar despesa).
    - Orquestra renderização das viagens chamando `renderizarViagens()`.
*/
import {
    mostrarToast,
    popularDespesas,
    criarLinhaDespesa,
    atualizarTotalDespesas,
} from "./ui.js";
import { buscarEnderecoPorCep, geocodificar } from "./services.js";
import { renderizarViagens, tratarEnvioFormularioViagem } from "./tripsUI.js";
import { inicializarUsuarioUI } from "./userUI.js";

async function init() {
    inicializarUsuarioUI();

    document
        .getElementById("tripForm")
        .addEventListener("submit", tratarEnvioFormularioViagem);

    const cepDestinoInput = document.getElementById("cepDestino");
    if (cepDestinoInput) {
        cepDestinoInput.addEventListener("blur", async (e) => {
            const cep = e.target.value.trim();
            if (!cep) return;
            const cepObj = await buscarEnderecoPorCep(cep);
            if (cepObj) {
                const destInput = document.getElementById("destino");
                const short = [cepObj.bairro, cepObj.localidade, cepObj.uf]
                    .filter(Boolean)
                    .join(", ");
                if (
                    destInput &&
                    (!destInput.value || destInput.value.trim() === "")
                )
                    destInput.value = short;
                const destResolvedEl = document.getElementById("destResolved");
                if (destResolvedEl)
                    destResolvedEl.innerText = `${cepObj.cep} — ${short}`;
                mostrarToast(
                    "Endereço obtido pelo CEP e aplicado no campo destino (se vazio)",
                    "success",
                    2000
                );
            } else {
                mostrarToast("CEP não encontrado (ViaCEP)", "warning", 2500);
            }
        });
    }

    const origemInput = document.getElementById("origem");
    if (origemInput) {
        origemInput.addEventListener("blur", async (e) => {
            const q = e.target.value.trim();
            if (!q) return;
            const geo = await geocodificar(q);
            const origResolvedEl = document.getElementById("origResolved");
            if (geo && geo.address) {
                const a = geo.address;
                const bairro =
                    a.neighbourhood || a.suburb || a.village || a.hamlet || "";
                const cidade = a.city || a.town || a.village || a.county || "";
                const uf = a.state || a.region || "";
                const cep = a.postcode || "";
                const short = [bairro, cidade, uf].filter(Boolean).join(", ");
                if (origResolvedEl)
                    origResolvedEl.innerText = `${
                        cep ? cep + " — " : ""
                    }${short}`;
            } else if (origResolvedEl) origResolvedEl.innerText = "";
        });
    }

    const btnAddExpense = document.getElementById("btnAddExpense");
    if (btnAddExpense) {
        btnAddExpense.addEventListener("click", () => {
            const container = document.getElementById("expensesList");
            const row = criarLinhaDespesa("", 0);
            container.appendChild(row);
            atualizarTotalDespesas();
        });
    }

    function abrirModalNovaViagem() {
        const form = document.getElementById("tripForm");
        form?.reset();
        document.getElementById("tripId").value = "";
        document.getElementById("distanciaTxt").innerText = "—";
        document.getElementById("combustivelTxt").innerText = "—";
        popularDespesas([]);
        const destResolvedEl = document.getElementById("destResolved");
        const origResolvedEl = document.getElementById("origResolved");
        if (destResolvedEl) destResolvedEl.innerText = "";
        if (origResolvedEl) origResolvedEl.innerText = "";
        const modalEl = document.getElementById("tripModal");
        if (modalEl) {
            const bs = bootstrap.Modal.getOrCreateInstance(modalEl);
            bs.show();
        }
    }

    const btnNew = document.getElementById("btnNewTrip");
    if (btnNew) {
        try {
            btnNew.type = "button";
        } catch {}
        btnNew.addEventListener("click", (e) => {
            e.preventDefault();
            abrirModalNovaViagem();
        });
        btnNew.onclick = (e) => {
            e.preventDefault();
            abrirModalNovaViagem();
        };
        btnNew.style.pointerEvents = "auto";
    }
    document.body.addEventListener("click", (e) => {
        const el =
            e.target && e.target.closest
                ? e.target.closest("#btnNewTrip")
                : null;
        if (el) {
            e.preventDefault();
            abrirModalNovaViagem();
        }
    });

    const dataIdaEl = document.getElementById("dataIda");
    const dataVoltaEl = document.getElementById("dataVolta");
    const diasTxtEl = document.getElementById("diasTxt");
    const updateDays = () => {
        const d1 = dataIdaEl?.value ? new Date(dataIdaEl.value) : null;
        const d2 = dataVoltaEl?.value ? new Date(dataVoltaEl.value) : null;
        if (d1 && d2) {
            const diff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
            const days = diff >= 0 ? diff + 1 : null;
            diasTxtEl &&
                (diasTxtEl.innerText = days != null ? String(days) : "—");
        } else {
            diasTxtEl && (diasTxtEl.innerText = "—");
        }
    };
    if (dataIdaEl) dataIdaEl.addEventListener("change", updateDays);
    if (dataVoltaEl) dataVoltaEl.addEventListener("change", updateDays);

    document
        .getElementById("searchInput")
        .addEventListener("input", (e) => renderizarViagens(e.target.value));
    document.getElementById("btnClear").addEventListener("click", () => {
        document.getElementById("searchInput").value = "";
        renderizarViagens("");
    });

    await renderizarViagens();
    mostrarToast("Aplicação pronta", "info", 1500);
}

window.addEventListener("DOMContentLoaded", init);
