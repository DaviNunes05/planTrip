/*
    userUI.js
    Lógica do modal "Meus dados" (perfil do usuário):
    - Carrega e salva o consumo (km/l) e preço do litro no LocalStorage.
    - Fornece medidor prático por odômetro (calcular km/l a partir de início/fim e litros) e opção de salvar o resultado.
    - Exporta `inicializarUsuarioUI()` que liga os handlers do modal.
*/
import { obterUsuario, salvarUsuario } from "./data.js";
import { mostrarToast } from "./ui.js";

export function inicializarUsuarioUI() {
    const u = obterUsuario();
    if (u) {
        const kmEl = document.getElementById("kmPorLitro");
        const precoEl = document.getElementById("precoLitro");
        if (kmEl) kmEl.value = u.kmPorLitro || "";
        if (precoEl) precoEl.value = u.precoLitro || "";
    }

    const userForm = document.getElementById("userForm");
    if (userForm) {
        userForm.addEventListener("submit", (ev) => {
            ev.preventDefault();
            const kmPorLitro =
                Number(document.getElementById("kmPorLitro").value) || 0;
            const precoLitro =
                Number(document.getElementById("precoLitro").value) || 0;
            salvarUsuario({ kmPorLitro, precoLitro });
            mostrarToast("Dados do usuário salvos", "success");
            bootstrap.Modal.getInstance(
                document.getElementById("userModal")
            )?.hide();
        });
    }

    const btnCalcOdo = document.getElementById("btnCalcOdo");
    const btnSaveOdo = document.getElementById("btnSaveOdo");
    if (btnCalcOdo) {
        btnCalcOdo.addEventListener("click", () => {
            const rawStart = document.getElementById("measOdoStart").value;
            const rawEnd = document.getElementById("measOdoEnd").value;
            const start = rawStart === "" ? 0 : Number(rawStart) || 0;
            const end = rawEnd === "" ? 0 : Number(rawEnd) || 0;
            const litros =
                Number(document.getElementById("measLitrosOdo").value) || 0;
            const out = document.getElementById("odoResult");

            let distancia = null;
            if (start === 0 && end > 0 && litros > 0) {
                distancia = end;
            } else if (start > 0 && end > start && litros > 0) {
                distancia = end - start;
            } else {
                mostrarToast(
                    "Informe odômetro inicial e final válidos ou, se usar valor parcial, coloque 0 em início e o valor parcial em fim. Também informe litros abastecidos.",
                    "warning"
                );
                if (out) out.innerText = "Valores inválidos";
                return;
            }

            const kmpl = distancia / litros;
            if (out)
                out.innerText = `${kmpl.toFixed(
                    2
                )} km/l — ${distancia} km / ${litros.toFixed(2)} L`;
        });
    }

    if (btnSaveOdo) {
        btnSaveOdo.addEventListener("click", () => {
            const out = document.getElementById("odoResult");
            const text = out?.innerText || "";
            const match = text.match(/([0-9]+[.,]?[0-9]*)\s*km\/l/);
            if (!match) {
                mostrarToast("Calcule a média antes de salvar.", "warning");
                return;
            }
            const kmpl = Number(match[1].replace(",", ".")) || 0;
            if (!kmpl) {
                mostrarToast("Valor de km/l inválido.", "warning");
                return;
            }
            const kmEl = document.getElementById("kmPorLitro");
            if (kmEl) kmEl.value = kmpl;
            const preco =
                Number(document.getElementById("precoLitro").value) || 0;
            salvarUsuario({ kmPorLitro: kmpl, precoLitro: preco });
            mostrarToast("Média salva como seu consumo (km/l).", "success");
        });
    }
}

export default inicializarUsuarioUI;
