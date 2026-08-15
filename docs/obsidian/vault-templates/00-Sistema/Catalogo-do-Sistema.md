---
tipo: catalogo-sistema
---

# Catálogo do sistema Lúmen

Visão geral por área. Atualizado manualmente — não muda sozinho, só quando um módulo novo entra
no sistema. Para os DADOS de verdade (clientes, processos, financeiro), veja as pastas
`02-Clientes`, `03-Processos`, `04-Assessorias`, `05-Atendimentos`, `06-Financeiro` — geradas
automaticamente por `scripts/exportar-obsidian.ts`.

## Processos e Casos
Cadastro de processos judiciais, administrativos e casos extrajudiciais. Cada um tem: partes,
valores (causa, condenação, acordo, proveito econômico), instância/tribunal, andamentos,
publicações vinculadas, anexos (peças), tarefas/compromissos, financeiro (honorários) e histórico
de protocolos.

## Atendimento (CRM de captação)
Funil comercial de leads antes de virarem processo: Novo → Triagem → Convertido/Arquivado, com um
segundo eixo comercial (Novo → Qualificação → Proposta → Fechado/Perdido). Pode ser convertido em
Processo, pré-preenchendo o honorário pretendido.

## Assessoria Jurídica
Contrato de assessoria contínua com uma empresa-cliente (mensalidade fixa). Reúne documentos da
empresa, pareceres (pastas de documento), licitações acompanhadas, processos/atendimentos
vinculados e a cobrança mensal automática (honorário de assessoria).

## Financeiro
Contas a Pagar/Receber, honorários (fixo, percentual sobre base do processo, ou os dois),
recorrências (honorário "até o arquivamento", despesa recorrente sem data de fim), baixa parcial
de pagamento, DRE e Livro Caixa (regime de caixa), Fluxo de Caixa, Relatórios gerenciais,
Relatório Personalizado (filtros livres + exportação Word/PDF).

## Publicações e Andamentos
Captura automática de publicações judiciais (robô DJEN/Datajud) e de e-mails de publicação
(Jusbrasil), vinculadas ao processo pelo número. Central de Alertas cruza prazos, tarefas e
publicações não lidas num só lugar.

## Painel Mestre (só para o dono da plataforma)
Administração multi-tenant: cadastro de escritórios-clientes, módulos contratados por
escritório, assinatura/cobrança (Asaas), suporte com sessão mascarada e auditoria.

## Armazenamento de documentos
Integração com Google Drive, Microsoft OneDrive e Dropbox — cada anexo do sistema é um link para
o arquivo no provedor conectado do escritório, nunca uma cópia dentro do Lúmen.

## App mobile (PWA)
Versão dedicada para celular (`/m`), instalável, com paridade de funcionalidade dos módulos
principais (Financeiro, Processos, Atendimento, Assessoria, Relatórios, Publicações).
