# Planejador de Viagens

Aplicação frontend simples para planejar viagens usando HTML, Bootstrap e JavaScript modular (ES Modules).

Sumário
- Funções principais: CRUD de viagens, despesas por item, cálculo estimado de combustível (usando dados do usuário), busca por destino/origem, integração opcional com ViaCEP / Nominatim / OSRM para geocoding e roteamento.
- Persistência: LocalStorage do navegador (sem servidor).

Recursos principais
- Cadastrar, editar e excluir viagens.
- Lista dinâmica de despesas (descrição + valor) por viagem e soma automática.
- Modal "Meus dados" para configurar consumo (km/l), preço do litro e medição por odômetro (calcular média e salvar).
- Busca em tempo real por destino/origem.
- Favicon e placeholder de imagem para viagens sem foto.

Estrutura de arquivos (resumida)

```
planejador-viagens/
├─ index.html            # Entrada da aplicação (carrega Bootstrap e js/app.js como module)
├─ css/
│  └─ style.css         # Estilos custom (variáveis, ajustes responsivos)
├─ js/
│  ├─ app.js            # Entrypoint: inicializa listeners e chama render
│  ├─ data.js           # Persistência (LocalStorage): obter/salvar/deletar
│  ├─ services.js       # Integrações (ViaCEP, Nominatim, OSRM) e cálculo de distância
│  ├─ ui.js             # Helpers UI: toasts, formatação, despesas
│  ├─ tripsUI.js        # Renderização de cards e modal de viagem (interações)
│  └─ userUI.js         # Modal "Meus dados" e medição por odômetro
├─ img/
│  ├─ favicon.svg
│  └─ default-destination.svg
└─ README.md
```

Pré-requisitos
- Navegador moderno (Chrome, Edge, Firefox) com suporte a ES Modules.

Como executar (modo rápido)

1) Abre o arquivo `index.html` diretamente no navegador (duplo clique) — em muitos casos funciona, mas módulos ES importados a partir de arquivos locais às vezes apresentam restrições em alguns navegadores. Se tiver problema, use um servidor HTTP simples:

	- Com Python 3 (abre http://localhost:8000):

		```bash
		python -m http.server 8000
		```

	- Ou usando o Live Server do VS Code (recomendado para desenvolvimento)

2) A aplicação usa Bootstrap via CDN (não há instalação local). Abra a página e use a interface.

Fluxos de uso principais

- Meus dados: clique em "Meus dados" e preencha seu consumo (km/l) e preço do litro — esses valores serão utilizados para estimativa de custo de combustível.
- Nova viagem: clique em "Nova viagem" → preencha destino, origem (ou CEP) e adicione despesas. Se informar o CEP do destino, o app tentará resolver o endereço via ViaCEP e, se possível, usar esse endereço para calcular a rota com OSRM/Nominatim.
- Despesas: use "Adicionar despesa" para inserir itens; o total é somado automaticamente.
- Marcar como realizada: nos cards de viagem você pode marcar a viagem como realizada.

Persistência (LocalStorage)

- Chaves usadas no LocalStorage:
	- `pv_trips_local` — array de viagens salvas (JSON).
	- `pv_user_local` — objeto com dados do usuário (kmPorLitro, precoLitro, etc.).

Para limpar os dados manualmente: abra as DevTools → Application/Storage → Local Storage → remova as chaves acima.

Integrações externas (opcional)

- ViaCEP: consulta de CEP para obter bairro/cidade/UF e preencher destino (campo opcional). Não requer chave.
- Nominatim (OpenStreetMap): geocoding (buscar endereço a partir de cidade/CEP ou texto).
- OSRM: roteamento para obter distância por estrada (recomendado para estimativas reais de combustível). Em caso de falha em OSRM, a aplicação pode deixar a distância indefinida — revise logs no console.

Contribuição

Sinta-se livre para abrir issues ou enviar PRs. Para mudanças locais rápidas, recomendo usar o Live Server do VS Code.
