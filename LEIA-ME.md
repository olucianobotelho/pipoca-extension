# Pipoca — Cronômetro de Projetos

Extensão local para Chrome e Brave. O painel lateral acompanha projetos, sessões, tarifas em USD/BRL (incluindo projetos sem remuneração), histórico e lixeira. Por padrão a Pipoca roda isolada no **Painel Lateral**, sem injetar elementos automaticamente nas abas abertas.

## Instalação

1. Abra `chrome://extensions` no Chrome ou `brave://extensions` no Brave.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta que contém o arquivo `manifest.json`.
5. Fixe a **Pipoca** na barra do navegador e clique no ícone para abrir o painel.

Se já tinha a extensão carregada desta mesma pasta, clique no ícone **Recarregar** na página de extensões após substituir os arquivos para manter seus dados locais.

## Cronômetro e projetos

- **＋ Projeto** cria um projeto (com valor por hora em USD/BRL ou vazio/`0` para modo foco sem remuneração) e inicia a primeira sessão no Painel Lateral ao salvar.
- **Tempo já trabalhado**: ao criar um projeto, informe os minutos anteriores se já tiver começado antes de abrir a extensão.
- **Editar projeto** (ícone de lápis em qualquer card ou botão em **Detalhes**): altera nome, valor por hora, moeda, minutos da sessão atual, anotações e arquivos anexos.
- **Pausar**, **Retomar** e **Parar**: pause sem perder nada, retome depois ou encerre a sessão para registrar no histórico. Em projetos finalizados, use **Continuar** para seguir exatamente de onde parou ou **Nova** para zerar uma sessão.
- **Exportar e Importar JSON** (em **Ajustes → Cotação & Dados**): ao exportar, sessões em andamento são salvas com segurança como pausadas no arquivo com o tempo exato acumulado. Ao importar em outro navegador ou após limpar dados, basta clicar em **Retomar** (ou **Continuar** no histórico) para voltar exatamente de onde parou.
- **Conversão USD ↔ BRL**: clique no valor de ganhos no painel (ou no widget flutuante, caso o ative) para alternar dólar e real usando a cotação atualizada ou manual.
- **Lixeira**: projetos movidos para a lixeira podem ser restaurados ou excluídos definitivamente.

## Pipoca IA (opcional — BYOK)

Abra **Ajustes → IA** para configurar seu próprio provedor (OpenAI ou qualquer endpoint HTTPS compatível com Chat Completions) e sua chave de API. Tudo fica salvo apenas no armazenamento local do navegador.

- **Memória contínua do chat**: a Pipoca IA lê o histórico da conversa (até 40 turnos e até 6 prints recentes) para não perder o contexto; use **Limpar** quando quiser começar um assunto novo.
- **Aprendizado local do seu estilo e dúvidas comuns**: quando ativado (**Aprender meu estilo**, ligado por padrão), a Pipoca aprende localmente como você escreve e quais dúvidas costumam se repetir, adaptando explicações, rascunhos e atalhos rápidos. Você pode visualizar o resumo e clicar em **Resetar** a qualquer momento em **Ajustes → IA**.
- **Formatação inteligente & Markdown com cópia em 1 clique**: respostas renderizam títulos, tabelas, citações e blocos de código com botão **Copiar** em cada bloco, além dos botões **Copiar MD** e **Texto** em cada resposta e o atalho **Formatar MD** no campo de envio.
- **Múltiplos prints e Ctrl+V**: clique em **Print** para recortar trechos da tela (`Esc`, clique direito ou **Cancelar** abortam a seleção) ou pressione **Ctrl+V** na aba da Pipoca IA para colar até 6 imagens diretamente sem tocar no DOM da página.
- **Traduzir**: traduz trechos da aba ativa sob demanda preservando código, com cache local, explicações nos marcadores e botão **Desfazer**.

## Privacidade e isolamento

Projetos, sessões, rascunhos, histórico de chat, perfil aprendido e chave de API ficam exclusivamente no armazenamento local do seu navegador (`chrome.storage.local`). A extensão utiliza `use_dynamic_url: true` no Manifest V3 para impedir detecção por URL estática e não injeta scripts nem widgets automaticamente ao usar o cronômetro e o chat pelo Painel Lateral.
