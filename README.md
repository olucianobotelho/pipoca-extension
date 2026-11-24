# Pipoca — Cronômetro de Projetos & Assistente com IA

Extensão local (Manifest V3) para **Chrome** e **Brave** feita para acompanhar projetos, tempo trabalhado, ganhos em USD/BRL (ou projetos sem remuneração no modo foco), além de contar com a **Pipoca IA** opcional para tradução de abas e análise de múltiplos prints via chat.

---

## Principais recursos

- **Cronômetro de projetos e widget flutuante**
  - Crie projetos com tarifa por hora em **USD** ou **BRL**, ou deixe o valor vazio (`0`) para usar em **modo foco livre (sem remuneração)**.
  - Lance minutos já trabalhados ao criar o projeto.
  - Edite qualquer projeto a qualquer momento (**ícone de lápis** no card ou em **Detalhes**): altere nome, valor por hora, moeda, minutos da sessão atual, anotações com links e arquivos anexos.
  - Controle pelo **Painel Lateral** ou pelo **Widget Flutuante** arrastável na página (com opção de recolher na borda).

- **Pausar, Exportar, Importar e Continuar de onde parou**
  - **Pausar** e **Retomar** a sessão sem perder o progresso.
  - Em projetos encerrados, escolha **Continuar** (retoma exatamente de onde parou) ou **Nova** (inicia nova sessão zerada).
  - Em **Ajustes → Cotação & Dados**, exporte o backup completo em `.json` (sessões em andamento são gravadas com segurança como pausadas no arquivo). Ao importar em outro navegador, os projetos já aparecem prontos para você clicar em **Retomar** ou **Continuar**.

- **Conversão USD ↔ BRL e metas com som**
  - Clique no valor acumulado no painel ou no widget flutuante para alternar dólar e real na hora (com cotação automática ou manual).
  - Notificações e aviso sonoro configurável por marco de ganho, com ajuste de volume e suporte a áudio personalizado.

- **Pipoca IA (opcional — traga sua própria chave)**
  - Configure qualquer provedor compatível com OpenAI Chat Completions (**Ajustes → IA**). Por padrão a IA vem desativada e **nenhuma chave ou endpoint pessoal acompanha este repositório**.
  - **Tradutor de páginas** sob demanda ou automático, preservando blocos de código e oferecendo explicações simples nos marcadores.
  - **Chat com múltiplos prints e `Ctrl+V`**: capture vários recortes da tela pelo botão **Print** ou cole imagens direto da área de transferência com `Ctrl+V` (até 6 prints por mensagem).

---

## Instalação no Chrome ou Brave

1. Clone ou baixe este repositório para uma pasta local.
2. Abra `chrome://extensions` (Chrome) ou `brave://extensions` (Brave).
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`.
5. Fixe a extensão **Pipoca** na barra do navegador e clique no ícone para abrir o painel.

---

## Privacidade

Todos os projetos, histórico de sessões, anotações, anexos, histórico do chat e chave de API ficam salvos **apenas localmente no perfil do seu navegador** (`chrome.storage.local`). Nenhuma informação é enviada a servidores terceiros além do provedor de IA que você próprio configurar e da consulta pública de cotação USD/BRL.
