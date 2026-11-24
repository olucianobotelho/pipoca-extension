# Pipoca — Cronômetro de Projetos

Extensão local para Chrome e Brave. O painel lateral acompanha projetos, sessões, tarifas em USD/BRL (incluindo projetos sem remuneração), histórico e lixeira. O tempo e o valor continuam atualizando enquanto o painel fica aberto ou minimizado no widget flutuante.

## Instalação

1. Abra `chrome://extensions` no Chrome ou `brave://extensions` no Brave.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta que contém o arquivo `manifest.json`.
5. Fixe a **Pipoca** na barra do navegador e clique no ícone para abrir o painel.

Se já tinha a extensão carregada desta mesma pasta, clique no ícone **Recarregar** na página de extensões após substituir os arquivos para manter seus dados locais.

## Cronômetro e projetos

- **＋ Projeto** cria um projeto (com valor por hora em USD/BRL ou vazio/`0` para modo foco sem remuneração) e inicia a primeira sessão ao salvar.
- **Tempo já trabalhado**: ao criar um projeto, informe os minutos anteriores se já tiver começado antes de abrir a extensão.
- **Editar projeto** (ícone de lápis em qualquer card ou botão em **Detalhes**): altera nome, valor por hora, moeda, minutos da sessão atual, anotações e arquivos anexos.
- **Pausar**, **Retomar** e **Parar**: pause sem perder nada, retome depois ou encerre a sessão para registrar no histórico. Em projetos finalizados, use **Continuar** para seguir exatamente de onde parou ou **Nova** para zerar uma sessão.
- **Exportar e Importar JSON** (em **Ajustes → Cotação & Dados**): ao exportar, sessões em andamento são salvas com segurança como pausadas no arquivo com o tempo exato acumulado. Ao importar em outro navegador ou após limpar dados, basta clicar em **Retomar** (ou **Continuar** no histórico) para voltar exatamente de onde parou.
- **Conversão USD ↔ BRL**: clique no valor de ganhos no painel ou no widget flutuante para alternar dólar e real usando a cotação atualizada (ou cotação manual configurada em Ajustes).
- **Lixeira**: projetos movidos para a lixeira podem ser restaurados ou excluídos definitivamente.

## Pipoca IA (opcional — BYOK)

Abra **Ajustes → IA** para configurar seu próprio provedor (OpenAI ou qualquer endpoint HTTPS compatível com Chat Completions) e sua chave de API. Tudo fica salvo apenas no armazenamento local do navegador.

- **Traduzir**: traduz trechos da aba atual preservando áreas de código, com cache local, explicações simples nos marcadores e botão **Desfazer**.
- **Múltiplos prints e Ctrl+V no chat**: clique em **Print** para recortar trechos da tela quantas vezes precisar ou pressione **Ctrl+V** diretamente na aba da Pipoca IA para colar imagens da área de transferência (até 6 prints por mensagem). Todas as imagens são enviadas junto da sua pergunta.

## Privacidade e dados locais

Projetos, sessões, rascunhos, histórico de chat e chave de API ficam exclusivamente no armazenamento local do seu navegador (`chrome.storage.local`). Nenhum servidor externo da extensão recebe seus dados: as requisições só vão para a URL do provedor de IA que você configurar (quando ativado) e para consultar a cotação pública USD/BRL.
