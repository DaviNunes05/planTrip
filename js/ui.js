/*
    ui.js
    Utilitários de interface (UI helpers):
    - Toastrs personalizados (`mostrarToast`).
    - Formatação (moeda/data).
    - Manipulação da lista dinâmica de despesas (criar, ler, popular, total).
    - Controle do spinner/estado de "calculando" no modal.
*/
export function mostrarToast(message, type = "info", delay = 3000) {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toastId = "toast" + Date.now();
    const toast = document.createElement("div");
    toast.className = `toast align-items-center text-bg-${type} border-0`;
    toast.role = "alert";
    toast.ariaLive = "assertive";
    toast.ariaAtomic = "true";
    toast.id = toastId;
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>`;
    container.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay });
    bsToast.show();
    toast.addEventListener("hidden.bs.toast", () => toast.remove());
}

export function formatarMoeda(v) {
    return v == null
        ? "R$ 0,00"
        : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(iso) {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    } catch {
        return iso;
    }
}

export function criarLinhaDespesa(nome = "", valor = 0) {
    const row = document.createElement("div");
    row.className = "d-flex gap-2 mb-2 align-items-center expense-row";
    row.innerHTML = `
        <input type="text" class="form-control form-control-sm expense-name" placeholder="Descrição" value="${nome}">
        <input type="number" step="0.01" min="0" class="form-control form-control-sm expense-value" placeholder="0.00" value="${Number(
            valor
        ).toFixed(2)}">
        <button type="button" class="btn btn-sm btn-outline-danger btn-remove-expense" title="Remover">&times;</button>
    `;
    row.querySelector(".btn-remove-expense").addEventListener("click", () => {
        row.remove();
        atualizarTotalDespesas();
    });
    row.querySelector(".expense-value").addEventListener("input", () =>
        atualizarTotalDespesas()
    );
    return row;
}

export function lerDespesasDoDOM() {
    const container = document.getElementById("expensesList");
    const items = [];
    if (!container) return items;
    container.querySelectorAll(".expense-row").forEach((r) => {
        const name = r.querySelector(".expense-name")?.value?.trim() || "";
        const value =
            parseFloat(r.querySelector(".expense-value")?.value || 0) || 0;
        if (name || value) items.push({ name, value });
    });
    return items;
}

export function atualizarTotalDespesas() {
    const items = lerDespesasDoDOM();
    const sum = items.reduce((s, it) => s + (Number(it.value) || 0), 0);
    const el = document.getElementById("despesasTotalTxt");
    if (el) el.innerText = formatarMoeda(sum);
    return sum;
}

export function popularDespesas(items = []) {
    const container = document.getElementById("expensesList");
    if (!container) return;
    container.innerHTML = "";
    for (const it of items) {
        const row = criarLinhaDespesa(it.name, it.value || 0);
        container.appendChild(row);
    }
    atualizarTotalDespesas();
}

export function definirCalculando(loading = true) {
    const spinner = document.getElementById("calcSpinner");
    if (spinner) {
        if (loading) spinner.classList.remove("d-none");
        else spinner.classList.add("d-none");
    }
    const submitBtn = document.querySelector('#tripForm button[type="submit"]');
    if (submitBtn) submitBtn.disabled = loading;
}
