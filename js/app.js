import { getUser, saveUser } from './data.js';
import { showToast, populateExpenses, createExpenseRow, updateExpensesTotalDisplay } from './ui.js';
import { buscarEnderecoPorCep, geocode } from './services.js';
import { renderTrips, handleTripFormSubmit } from './tripsUI.js';

function handleUserFormSubmit(ev) {
    ev.preventDefault();
    const kmPorLitro = Number(document.getElementById("kmPorLitro").value) || 0;
    const precoLitro = Number(document.getElementById("precoLitro").value) || 0;
    const user = { kmPorLitro, precoLitro };
    saveUser(user);
    showToast("Dados do usuário salvos", "success");
    bootstrap.Modal.getInstance(document.getElementById("userModal"))?.hide();
}

async function init() {
    const u = getUser();
    if (u) {
        document.getElementById("kmPorLitro").value = u.kmPorLitro;
        document.getElementById("precoLitro").value = u.precoLitro;
    } else {
        document.getElementById("kmPorLitro").value = 10;
        document.getElementById("precoLitro").value = 5.5;
    }

    document.getElementById("tripForm").addEventListener("submit", handleTripFormSubmit);
    document.getElementById("userForm").addEventListener("submit", handleUserFormSubmit);

    const cepDestinoInput = document.getElementById('cepDestino');
    if (cepDestinoInput) {
        cepDestinoInput.addEventListener('blur', async (e) => {
            const cep = e.target.value.trim();
            if (!cep) return;
            const cepObj = await buscarEnderecoPorCep(cep);
            if (cepObj) {
                const destInput = document.getElementById('destino');
                const short = [cepObj.bairro, cepObj.localidade, cepObj.uf].filter(Boolean).join(', ');
                if (destInput && (!destInput.value || destInput.value.trim() === '')) destInput.value = short;
                const destResolvedEl = document.getElementById('destResolved');
                if (destResolvedEl) destResolvedEl.innerText = `${cepObj.cep} — ${short}`;
                showToast('Endereço obtido pelo CEP e aplicado no campo destino (se vazio)', 'success', 2000);
            } else {
                showToast('CEP não encontrado (ViaCEP)', 'warning', 2500);
            }
        });
    }

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
            } else if (origResolvedEl) origResolvedEl.innerText = '';
        });
    }

    const btnAddExpense = document.getElementById('btnAddExpense');
    if (btnAddExpense) {
        btnAddExpense.addEventListener('click', () => {
            const container = document.getElementById('expensesList');
            const row = createExpenseRow('', 0);
            container.appendChild(row);
            updateExpensesTotalDisplay();
        });
    }

    const btnCalcOdo = document.getElementById('btnCalcOdo');
    const btnSaveOdo = document.getElementById('btnSaveOdo');
    if (btnCalcOdo) {
        btnCalcOdo.addEventListener('click', () => {
            const rawStart = document.getElementById('measOdoStart').value;
            const rawEnd = document.getElementById('measOdoEnd').value;
            const start = rawStart === '' ? 0 : Number(rawStart) || 0;
            const end = rawEnd === '' ? 0 : Number(rawEnd) || 0;
            const litros = Number(document.getElementById('measLitrosOdo').value) || 0;
            const out = document.getElementById('odoResult');

            let distancia = null;
            if ((start === 0) && end > 0 && litros > 0) {
                distancia = end;
            } else if (start > 0 && end > start && litros > 0) {
                distancia = end - start;
            } else {
                showToast('Informe odômetro inicial e final válidos ou, se usar valor parcial, coloque 0 em início e o valor parcial em fim. Também informe litros abastecidos.', 'warning');
                if (out) out.innerText = 'Valores inválidos';
                return;
            }

            const kmpl = distancia / litros;
            if (out) out.innerText = `${kmpl.toFixed(2)} km/l — ${distancia} km / ${litros.toFixed(2)} L`;
        });
    }
    if (btnSaveOdo) {
        btnSaveOdo.addEventListener('click', () => {
            const out = document.getElementById('odoResult');
            const text = out?.innerText || '';
            const match = text.match(/([0-9]+[.,]?[0-9]*)\s*km\/l/);
            if (!match) {
                showToast('Calcule a média antes de salvar.', 'warning');
                return;
            }
            const kmpl = Number(match[1].replace(',', '.')) || 0;
            if (!kmpl) {
                showToast('Valor de km/l inválido.', 'warning');
                return;
            }
            // atualiza campo e salva usuário
            document.getElementById('kmPorLitro').value = kmpl;
            const preco = Number(document.getElementById('precoLitro').value) || 0;
            saveUser({ kmPorLitro: kmpl, precoLitro: preco });
            showToast('Média salva como seu consumo (km/l).', 'success');
        });
    }

    function openNewTripModal() {
        const form = document.getElementById("tripForm");
        form?.reset();
        document.getElementById("tripId").value = "";
        document.getElementById("distanciaTxt").innerText = "—";
        document.getElementById("combustivelTxt").innerText = "—";
        populateExpenses([]);
        const destResolvedEl = document.getElementById('destResolved');
        const origResolvedEl = document.getElementById('origResolved');
        if (destResolvedEl) destResolvedEl.innerText = '';
        if (origResolvedEl) origResolvedEl.innerText = '';
        const modalEl = document.getElementById('tripModal');
        if (modalEl) {
            const bs = bootstrap.Modal.getOrCreateInstance(modalEl);
            bs.show();
        }
    }

    const btnNew = document.getElementById('btnNewTrip');
    if (btnNew) {
        try { btnNew.type = 'button'; } catch {}
        btnNew.addEventListener('click', (e) => { e.preventDefault(); openNewTripModal(); });
        btnNew.onclick = (e) => { e.preventDefault(); openNewTripModal(); };
        btnNew.style.pointerEvents = 'auto';
    }
    document.body.addEventListener('click', (e) => {
        const el = e.target && e.target.closest ? e.target.closest('#btnNewTrip') : null;
        if (el) { e.preventDefault(); openNewTripModal(); }
    });

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

    document.getElementById("searchInput").addEventListener("input", (e) => renderTrips(e.target.value));
    document.getElementById("btnClear").addEventListener("click", () => { document.getElementById("searchInput").value = ""; renderTrips(""); });

    await renderTrips();
    showToast("Aplicação pronta", "info", 1500);
}

window.addEventListener("DOMContentLoaded", init);
