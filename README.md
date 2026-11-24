# Pipoca — Cronômetro de Projetos & Assistente com IA

Extensão local (Manifest V3) para **Chrome** e **Brave** para acompanhar projetos, tempo trabalhado, ganhos em USD/BRL (ou modo foco sem remuneração), com **Pipoca IA** opcional para geração inteligente de Markdown, memória adaptativa local, múltiplos prints e tradução sob demanda.

Por padrão, a Pipoca roda isolada no **Painel Lateral** com `"use_dynamic_url": true`, sem injetar elementos automaticamente nas páginas abertas.

---

## Principais recursos

- **Cronômetro de projetos e modo isolado**
  - Crie projetos com tarifa por hora em **USD** ou **BRL**, ou deixe vazio (`0`) para usar em **modo foco livre (sem remuneração)**.
  - Lance minutos já trabalhados ao criar o projeto.
  - Edite qualquer projeto (**ícone de lápis** no card ou em **Detalhes**): nome, valor/hora, moeda, minutos da sessão atual, anotações com links e arquivos anexos.
  - Use no **Painel Lateral** (zero injeção automática na página) ou ative opcionalmente o **Widget Flutuante** arrastável quando desejar.

- **Pausar, Exportar, Importar e Continuar de onde parou**
  - **Pausar** e **Retomar** a sessão sem perder o progresso; em projetos encerrados, use **Continuar** ou **Nova**.
  - Em **Ajustes → Cotação & Dados**, exporte e importe `.json`: sessões ativas são gravadas como pausadas com o tempo exato acumulado para você continuar de onde parou.

- **Conversão USD ↔ BRL e metas com som**
  - Clique nos ganhos para alternar dólar e real (cotação automática ou manual).
  - Notificações e aviso sonoro configurável por marco de ganho com ajuste de volume e áudio personalizado.

- **Pipoca IA (opcional — traga sua própria chave)**
  - Configure OpenAI ou qualquer endpoint HTTPS compatível (**Ajustes → IA**). Por padrão vem desativada e **nenhuma chave pessoal acompanha este repositório**.
  - **Memória contínua do chat**: lê até 40 turnos e até 6 prints recentes para manter o contexto completo.
  - **Aprender meu estilo (local)**: analisa como você escreve, preferências e dúvidas comuns para adaptar respostas e atalhos; gerenciável/resetável em **Ajustes → IA**.
  - **Markdown inteligente com 1 clique**: renderiza títulos, listas, tabelas e blocos com botão **Copiar** em cada bloco, botões **Copiar MD** e **Texto** por resposta e atalho **Formatar MD** no compositor.
  - **Múltiplos prints e `Ctrl+V`**: recorte vários trechos (**Esc**, botão direito ou **Cancelar** abortam) ou cole imagens direto do clipboard com `Ctrl+V` (até 6 prints por mensagem).
  - **Tradutor sob demanda** preservando código e explicações simples nos marcadores.

---

## Instalação no Chrome ou Brave

1. Clone ou baixe este repositório para uma pasta local.
2. Abra `chrome://extensions` (Chrome) ou `brave://extensions` (Brave).
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta com `manifest.json`.
5. Fixe a extensão **Pipoca** na barra do navegador e clique no ícone para abrir o painel.

---

## Privacidade

Projetos, sessões, rascunhos, histórico do chat, memória de estilo aprendida e chave de API ficam salvos **apenas localmente no perfil do seu navegador** (`chrome.storage.local`). Recursos que interagem com a aba (Widget Flutuante, Tradutor, Captura de tela/campos) só executam quando acionados manualmente por você.
