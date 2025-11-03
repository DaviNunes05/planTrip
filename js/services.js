/*
    services.js
    Integração com serviços externos:
    - Geocoding usando Nominatim (`geocodificar`).
    - Busca de endereço por CEP via ViaCEP (`buscarEnderecoPorCep`).
    - Cálculo de rota por estrada via OSRM (`calcularRotaOSRM`).
    - Função de alto nível `calcularDistancia` que combina CEP/geocoding/OSRM e retorna km e dados resolvidos.
*/
import { mostrarToast } from "./ui.js";

export async function geocodificar(query) {
    const baseUrl = "https://nominatim.openstreetmap.org/search";
    const params = new URLSearchParams({
        q: query,
        format: "json",
        addressdetails: "1",
        limit: "1",
        countrycodes: "br",
    });
    const url = `${baseUrl}?${params.toString()}`;
    try {
        const res = await fetch(url, {
            headers: { "Accept-Language": "pt-BR" },
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                display_name: data[0].display_name,
                address: data[0].address || {},
            };
        }
        return null;
    } catch (e) {
        console.error("Erro geocodificar:", e);
        return null;
    }
}

export async function buscarEnderecoPorCep(cep) {
    if (!cep) return null;
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return null;
    const url = `https://viacep.com.br/ws/${digits}/json/`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.erro) return null;
        const obj = {
            cep: digits,
            logradouro: data.logradouro || "",
            bairro: data.bairro || "",
            localidade: data.localidade || "",
            uf: data.uf || "",
        };
        obj.formatted = [obj.logradouro, obj.bairro, obj.localidade, obj.uf]
            .filter(Boolean)
            .join(", ");
        return obj;
    } catch (e) {
        console.error("Erro ViaCEP:", e);
        return null;
    }
}

export async function calcularRotaOSRM(lat1, lon1, lat2, lon2) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.code === "Ok" && data.routes && data.routes.length > 0)
            return data.routes[0].distance / 1000;
        return null;
    } catch (e) {
        console.warn("Erro OSRM:", e);
        return null;
    }
}

export async function calcularDistancia(origem, destino) {
    const isCep = (str) =>
        /^\d{5}-?\d{3}$/.test((str || "").replace(/\D/g, ""));
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
        } else return null;
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
        } else return null;
    }
    let origGeo = await geocodificar(enderecoOrigem);
    let destGeo = await geocodificar(enderecoDestino);
    if (!origGeo && enderecoOrigem.includes(",")) {
        const parts = enderecoOrigem.split(",");
        const cidadeEstado = parts.slice(-2).join(",");
        origGeo = await geocodificar(cidadeEstado);
    }
    if (!destGeo && enderecoDestino.includes(",")) {
        const parts = enderecoDestino.split(",");
        const cidadeEstado = parts.slice(-2).join(",");
        destGeo = await geocodificar(cidadeEstado);
    }
    if (!origGeo || !destGeo) {
        mostrarToast(
            "Não foi possível localizar origem/destino. Tente informar apenas a cidade.",
            "warning",
            4000
        );
        return null;
    }

    const extractFromGeo = (geo) => {
        if (!geo) return null;
        const a = geo.address || {};
        const bairro =
            a.neighbourhood ||
            a.suburb ||
            a.village ||
            a.hamlet ||
            a.quarter ||
            "";
        const cidade = a.city || a.town || a.village || a.county || "";
        const uf = a.state || a.region || "";
        const cep = a.postcode || null;
        const full = [bairro, cidade, uf].filter(Boolean).join(", ");
        return { cep, bairro, cidade, uf, full: full || geo.display_name };
    };
    if (!resolvedOrig) resolvedOrig = extractFromGeo(origGeo);
    if (!resolvedDest) resolvedDest = extractFromGeo(destGeo);

    const distanciaOSRM = await calcularRotaOSRM(
        origGeo.lat,
        origGeo.lon,
        destGeo.lat,
        destGeo.lon
    );
    if (distanciaOSRM)
        return {
            km: distanciaOSRM,
            origResolved: resolvedOrig,
            destResolved: resolvedDest,
        };
    mostrarToast(
        "Não foi possível calcular rota por estrada; verifique origem/CEP e tente novamente.",
        "warning",
        4000
    );
    return { km: null, origResolved: resolvedOrig, destResolved: resolvedDest };
}
