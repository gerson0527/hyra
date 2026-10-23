export interface PlannerContext {
  issue: {
    key: string
    summary: string
    description: string
    issueType: string
    status: string
    comments: string[]
  }
  confluenceContent: string[]
  attachmentTexts: string[]
  repoContexts?: string[]
  customLinksContext?: string[]
}

export function buildPlannerPrompt(context: PlannerContext): string {
  const { issue, confluenceContent, attachmentTexts, repoContexts = [], customLinksContext = [] } = context

  const commentsSection = issue.comments.length > 0
    ? `\n### Comentarios del ticket\n${issue.comments.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
    : ""

  const confluenceSection = confluenceContent.length > 0
    ? `\n### Documentación de Confluence\n${confluenceContent.join("\n\n---\n\n")}`
    : ""

  const attachmentSection = attachmentTexts.length > 0
    ? `\n### Adjuntos del ticket\n${attachmentTexts.join("\n\n")}`
    : ""

  const reposSection = repoContexts.length > 0
    ? `\n### Código fuente de repositorios\n${repoContexts.join("\n\n---\n\n")}`
    : ""

  const customLinksSection = customLinksContext.length > 0
    ? `\n### Enlaces adicionales proporcionados por el usuario\n${customLinksContext.join("\n\n---\n\n")}`
    : ""

  return `Eres un estimador técnico senior para el proyecto MAIA ERP de Tiresia.

Stack del proyecto:
- Frontend: Angular + Ignite UI (Maia Web)
- Backend: Perl CGI + MariaDB (ERP Desktop)
- También existe un frontend secundario: Next.js + TypeScript (Hyra, herramienta interna)

Con base en el siguiente ticket de Jira, su documentación asociada y el código fuente relevante de los repositorios, genera:

1. **Lista de pasos técnicos necesarios**
   - Separa los pasos de frontend y backend cuando aplique
   - Incluye pasos de base de datos (migraciones, nuevas queries) si son necesarios
   - Incluye pasos de testing/validación
   - Si ves código relevante, referencia los archivos/rutas concretas que habría que modificar

2. **Estimación de horas por paso**
   - Perfil: desarrollador mid-level
   - Sé realista, no optimista

3. **Total de horas estimadas**

4. **Riesgos o ambigüedades detectadas en el ticket**
   - Menciona cualquier información faltante que podría afectar la estimación
   - Menciona complejidad técnica del código existente si es relevante

---

## Ticket: ${issue.key} — ${issue.issueType}

**Título**: ${issue.summary}

**Estado actual**: ${issue.status}

### Descripción
${issue.description || "(Sin descripción)"}
${commentsSection}
${confluenceSection}
${attachmentSection}
${reposSection}
${customLinksSection}

---

Responde en español. Usa markdown para estructurar tu respuesta.`
}
