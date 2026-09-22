import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { toBlob } from "html-to-image";
import { SequenceDiagramEditor } from "../src/components/SequenceDiagramEditor";
import { themes } from "../src/theme/themes";
import type { DesignProject, SequenceDiagramArtifact, SequenceDiagramContent } from "../src/types/diagram";
import { createEmptySequenceDiagramContent, normalizeSequenceDiagramContent } from "../src/utils/sequenceDiagram";
import type { DiagramSaveStatus } from "../src/hooks/useProjects";
import "../src/refined.css";
import "../src/styles.css";

const uploadArtifact = async (name: string, blob: Blob): Promise<void> => {
  const response = await fetch(`/api/upload?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!response.ok) throw new Error(`Failed to upload ${name}: ${response.statusText}`);
};

const notifyDone = async (report: Record<string, unknown>): Promise<void> => {
  await fetch("/api/done", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
};

const captureScreenshot = async (name: string): Promise<void> => {
  const el = document.getElementById("root");
  if (!el) return;
  const blob = await toBlob(el, { quality: 0.9 });
  if (blob) {
    await uploadArtifact(name, blob);
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type OverflowOffender = {
  tag: string;
  cls: string;
  text: string;
  overBy: number;
};

const collectInspectorMetrics = () => {
  const content = document.querySelector(".sequence-inspector-content");
  const panel = document.querySelector(".sequence-inspector-panel");
  const toolbar = document.querySelector(".sequence-inspector-toolbar");
  const offenders: OverflowOffender[] = [];
  let widest: OverflowOffender | null = null;
  if (content) {
    const els = content.querySelectorAll("*");
    els.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const overBy = htmlEl.scrollWidth - htmlEl.clientWidth;
      if (overBy > (widest?.overBy ?? 0)) {
        const chain: string[] = [];
        let ancestor: HTMLElement | null = htmlEl;
        for (let depth = 0; depth < 4 && ancestor; depth += 1) {
          chain.push(`${ancestor.tagName.toLowerCase()}.${(ancestor.className?.toString?.() || "").split(" ")[0] || "-"}`);
          ancestor = ancestor.parentElement;
        }
        widest = {
          tag: htmlEl.tagName.toLowerCase(),
          cls: (htmlEl.className?.toString?.() || "").split(" ").slice(0, 3).join(" "),
          text: `${(htmlEl.textContent || "").trim().slice(0, 50)} [${chain.join(" < ")}]`,
          overBy,
        };
      }
      if (htmlEl.offsetWidth === 0 && htmlEl.offsetHeight === 0) return;
      if (overBy > 2) {
        offenders.push({
          tag: htmlEl.tagName.toLowerCase(),
          cls: (htmlEl.className?.toString?.() || "").split(" ").slice(0, 3).join(" "),
          text: (htmlEl.textContent || "").trim().slice(0, 70),
          overBy,
        });
      }
      if (offenders.length >= 60) return;
    });
  }
  const box = (el: Element | null) => {
    if (!el) return null;
    const htmlEl = el as HTMLElement;
    return {
      clientWidth: htmlEl.clientWidth,
      scrollWidth: htmlEl.scrollWidth,
      overBy: htmlEl.scrollWidth - htmlEl.clientWidth,
    };
  };
  return {
    content: box(content),
    panel: box(panel),
    toolbar: box(toolbar),
    offenderCount: offenders.length,
    widest,
    offenders: offenders.slice(0, 60),
  };
};

export function InspectorAuditRunner() {
  const [saveStatus] = useState<DiagramSaveStatus>("saved");
  const [content, setContent] = useState<SequenceDiagramContent>(() =>
    normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [
        { id: "p1", kind: "actor", name: "Cliente", classifierName: "", x: 140 },
        { id: "p2", kind: "object", name: "GestorTramite", classifierName: "ControladorTramite", x: 420 },
        { id: "p3", kind: "entity", name: "EstadoTramite", classifierName: "EstadoTramite", x: 700 },
      ],
      items: [
        {
          id: "m1", kind: "message", type: "synchronous", sourceId: "p1", targetId: "p2",
          name: "getListTipoTramiteEstadoTramite", arguments: "", parameterValues: "",
          returnType: "List<TipoTramiteEstadoTramite>", flowReference: "",
        },
        {
          id: "f1", kind: "fragment", operator: "alt", name: "AlternativaDeTramiteConNombreLargo",
          operands: [
            {
              id: "op1", guard: "estadoEncontrado es igual a En Progreso buscando",
              items: [
                {
                  id: "m2", kind: "message", type: "synchronous", sourceId: "p2", targetId: "p3",
                  name: "getOrdenTipoTramiteEstado", arguments: "", parameterValues: "",
                  returnType: "int", flowReference: "",
                },
                {
                  id: "m3", kind: "message", type: "synchronous", sourceId: "p2", targetId: "p3",
                  name: "setFechaHoraHastaTramiteEstado", arguments: "fechaActual", parameterValues: "",
                  returnType: "", flowReference: "",
                },
              ],
            },
            {
              id: "op2", guard: "else",
              items: [
                {
                  id: "m4", kind: "message", type: "return", sourceId: "p3", targetId: "p2",
                  name: "", arguments: "", parameterValues: "", returnType: "", flowReference: "",
                },
              ],
            },
          ],
        },
        {
          id: "m5", kind: "message", type: "synchronous", sourceId: "p2", targetId: "p1",
          name: "setObservacionesTramiteEstado", arguments: "vObservaciones", parameterValues: "",
          returnType: "", flowReference: "",
        },
      ],
      notes: [
        { id: "n1", text: "Nota con un texto bastante largo para ver cómo envuelve dentro del inspector", x: 900, y: 500, anchorKind: "free" },
      ],
    }),
  );

  const project: DesignProject = {
    id: "proj-audit",
    name: "Auditoría Inspector",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    artifacts: [
      { id: "seq-1", type: "sequence-diagram", name: "Diagrama Principal", content } as SequenceDiagramArtifact,
    ],
  };
  const activeArtifact = project.artifacts[0] as SequenceDiagramArtifact;

  useEffect(() => {
    const runAudit = async () => {
      const report: { passed: boolean; error?: string; checks: Record<string, unknown> } = { passed: true, checks: {} };
      try {
        await wait(800);

        const clickFirst = async (selector: string, index = 0): Promise<boolean> => {
          const svg = document.querySelector("svg.sequence-diagram-svg");
          const els = svg?.querySelectorAll(selector);
          const el = els?.item(index) as Element | null;
          if (!el) return false;
          el.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true }));
          await wait(250);
          return true;
        };

        const setInspectorWidth = async (target: 260 | 320): Promise<number> => {
          const dragResizer = (): HTMLElement | null =>
            document.querySelector(".sequence-inspector-resizer") as HTMLElement | null;
          const dragTo = async (deltaX: number): Promise<void> => {
            const resizer = dragResizer();
            if (!resizer) return;
            const rect = resizer.getBoundingClientRect();
            const startX = rect.left + rect.width / 2;
            const startY = rect.top + rect.height / 2;
            resizer.dispatchEvent(new PointerEvent("pointerdown", { button: 0, clientX: startX, clientY: startY, bubbles: true }));
            await wait(30);
            window.dispatchEvent(new PointerEvent("pointermove", { clientX: startX + deltaX, clientY: startY, bubbles: true }));
            await wait(60);
            window.dispatchEvent(new PointerEvent("pointerup", { clientX: startX + deltaX, clientY: startY, bubbles: true }));
            await wait(80);
          };
          // Al mínimo primero (mover a la derecha achica), luego al objetivo.
          await dragTo(400);
          if (target > 260) {
            await dragTo(-(target - 260));
          }
          const panel = document.querySelector(".sequence-inspector-panel") as HTMLElement | null;
          return panel ? Math.round(panel.getBoundingClientRect().width) : -1;
        };

        const auditCase = async (label: string) => {
          await wait(150);
          const metrics = collectInspectorMetrics() as Record<string, unknown>;
          metrics.page = {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            overBy: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
          const rectOf = (selector: string) => {
            const el = document.querySelector(selector) as HTMLElement | null;
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return {
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              clientWidth: el.clientWidth,
              scrollWidth: el.scrollWidth,
              display: style.display,
              hidden: el.hidden,
            };
          };
          metrics.layout = {
            main: rectOf("main.editor-shell"),
            toolbar: rectOf("header.editor-toolbar"),
            toolbarActions: rectOf(".sequence-toolbar-actions-refined"),
            workspace: rectOf(".sequence-workspace"),
            outline: rectOf(".sequence-outline-panel"),
            canvas: rectOf(".sequence-canvas-panel"),
            canvasScroll: rectOf(".sequence-canvas-scroll"),
            canvasGuide: rectOf(".sequence-canvas-guide"),
            inspector: rectOf(".sequence-inspector-panel"),
            inspectorCollapsed: document.querySelector(".sequence-inspector-panel")?.classList.contains("collapsed"),
          };
          report.checks[label] = metrics;
          await captureScreenshot(`audit_${label}.png`);
        };

        const selections: Array<{ key: string; selector: string | null; index?: number }> = [
          { key: "fragment", selector: "g.sequence-fragment" },
          { key: "message", selector: "g.sequence-message" },
          { key: "participant", selector: "g.sequence-participant" },
          { key: "participant_long", selector: "g.sequence-participant", index: 1 },
          { key: "note", selector: "g.sequence-note" },
          { key: "none", selector: null },
        ];

        for (const selection of selections) {
          if (selection.selector) {
            const found = await clickFirst(selection.selector, selection.index ?? 0);
            report.checks[`selected_${selection.key}`] = found;
          } else {
            const svg = document.querySelector("svg.sequence-diagram-svg");
            svg?.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true }));
            await wait(250);
          }
          const width320 = await setInspectorWidth(320);
          report.checks[`width_${selection.key}_320`] = width320;
          await auditCase(`${selection.key}_320`);
          const width260 = await setInspectorWidth(260);
          report.checks[`width_${selection.key}_260`] = width260;
          await auditCase(`${selection.key}_260`);
        }

        // Inspector contraído.
        const collapseBtn = document.querySelector(
          'button[aria-label="Contraer inspector"]',
        ) as HTMLElement | null;
        collapseBtn?.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true }));
        await wait(250);
        await auditCase("collapsed");
        const expandBtn = document.querySelector(
          'button[aria-label="Expandir inspector"]',
        ) as HTMLElement | null;
        expandBtn?.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true }));
        await wait(250);

        // Menú desplegable del toolbar abierto (Ajustes).
        const summaries = Array.from(
          document.querySelectorAll("details.toolbar-menu > summary"),
        ) as HTMLElement[];
        const ajustes = summaries.find((s) => s.textContent?.includes("Ajustes")) ?? summaries[summaries.length - 1];
        ajustes?.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true }));
        await wait(250);
        await auditCase("menu_ajustes");
      } catch (error) {
        report.passed = false;
        report.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
      }
      await notifyDone(report);
    };
    void runAudit();
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
      <SequenceDiagramEditor
        artifact={activeArtifact}
        canRedo={false}
        canUndo={false}
        project={project}
        theme={themes[0]}
        themeId="warm-contrast"
        saveStatus={saveStatus}
        onNavigateToArtifact={() => undefined}
        onCreateSequenceDiagramArtifact={() => undefined}
        onChangeContent={(next) => setContent(next)}
        onRedo={() => undefined}
        onUndo={() => undefined}
        onImportProject={() => undefined}
        onThemeChange={() => undefined}
      />
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<InspectorAuditRunner />);
}
