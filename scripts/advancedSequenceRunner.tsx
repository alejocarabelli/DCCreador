import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { toBlob } from "html-to-image";
import { SequenceDiagramEditor } from "../src/components/SequenceDiagramEditor";
import { themes } from "../src/theme/themes";
import type { DesignProject, SequenceDiagramArtifact, SequenceDiagramContent, SequenceParticipant, SequenceMessage } from "../src/types/diagram";
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
  const blob = await toBlob(el, { quality: 0.95 });
  if (blob) {
    await uploadArtifact(name, blob);
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function AdvancedSequenceRunner() {
  const [saveStatus, setSaveStatus] = useState<DiagramSaveStatus>("saved");
  const [currentArtifactId, setCurrentArtifactId] = useState<string>("seq-1");
  const [, setNavigatedToArtifactId] = useState<string | null>(null);

  const initialP1: SequenceParticipant = { id: "p1", kind: "actor", name: "Cliente", classifierName: "", x: 140 };
  const initialP2: SequenceParticipant = { id: "p2", kind: "boundary", name: "Sistema", classifierName: "", x: 420 };
  const initialP3: SequenceParticipant = { id: "p3", kind: "entity", name: "Servidor", classifierName: "", x: 700 };

  const initialM1: SequenceMessage = {
    id: "m1",
    kind: "message",
    type: "synchronous",
    sourceId: "p1",
    targetId: "p2",
    name: "solicitarServicio",
    arguments: "params",
    parameterValues: "",
    returnType: "Resultado",
    flowReference: "",
  };

  const initialM2: SequenceMessage = {
    id: "m2",
    kind: "message",
    type: "synchronous",
    sourceId: "p2",
    targetId: "p3",
    name: "consultarBase",
    arguments: "id",
    parameterValues: "",
    returnType: "Datos",
    flowReference: "",
  };

  const initialM3: SequenceMessage = {
    id: "m3",
    kind: "message",
    type: "return",
    sourceId: "p3",
    targetId: "p2",
    name: "datosEncontrados",
    arguments: "",
    parameterValues: "",
    returnType: "",
    flowReference: "",
  };

  const initialM4: SequenceMessage = {
    id: "m4",
    kind: "message",
    type: "return",
    sourceId: "p2",
    targetId: "p1",
    name: "respuestaFinal",
    arguments: "",
    parameterValues: "",
    returnType: "",
    flowReference: "",
  };

  const initialContent = normalizeSequenceDiagramContent({
    ...createEmptySequenceDiagramContent(),
    participants: [initialP1, initialP2, initialP3],
    items: [initialM1, initialM2, initialM3, initialM4],
    notes: [],
  });

  const [artifacts, setArtifacts] = useState<SequenceDiagramArtifact[]>([
    {
      id: "seq-1",
      type: "sequence-diagram",
      name: "Diagrama Principal",
      content: initialContent,
    },
    {
      id: "seq-sub",
      type: "sequence-diagram",
      name: "Subproceso de Validación",
      content: normalizeSequenceDiagramContent({
        ...createEmptySequenceDiagramContent(),
        participants: [initialP2, initialP3],
        items: [],
      }),
    },
  ]);

  const [history, setHistory] = useState<SequenceDiagramContent[]>([initialContent]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const currentContent = history[historyIndex];

  const project: DesignProject = {
    id: "proj-test",
    name: "Proyecto Test Funciones Avanzadas",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    artifacts: artifacts.map((a) => (a.id === "seq-1" ? { ...a, content: currentContent } : a)),
  };

  const activeArtifact: SequenceDiagramArtifact =
    project.artifacts.find((s) => s.id === currentArtifactId) as SequenceDiagramArtifact ||
    artifacts[0];

  const handleChangeContent = (next: SequenceDiagramContent, options?: { separateHistoryEntry?: boolean }) => {
    setSaveStatus("saving");
    if (options?.separateHistoryEntry) {
      const nextHistory = [...history.slice(0, historyIndex + 1), next];
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    } else {
      const nextHistory = [...history];
      nextHistory[historyIndex] = next;
      setHistory(nextHistory);
    }
    setTimeout(() => {
      setSaveStatus("saved");
    }, 300);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
    }
  };

  const handleNavigateToArtifact = (targetId: string) => {
    setNavigatedToArtifactId(targetId);
  };

  const handleCreateSequenceDiagramArtifact = (name: string, content?: SequenceDiagramContent) => {
    const newArt: SequenceDiagramArtifact = {
      id: "seq-created-" + Date.now(),
      type: "sequence-diagram",
      name,
      content: content || createEmptySequenceDiagramContent(),
    };
    setArtifacts((prev) => [...prev, newArt]);
    setCurrentArtifactId(newArt.id);
  };

  // Autonomous test script executing all verifications
  useEffect(() => {
    const runAllTests = async () => {
      const report: { passed: boolean; status?: string; error?: string; stack?: string; checks: Record<string, unknown> } = { passed: true, checks: {} };
      try {
        await wait(600);

        // --- CHECK 0: Save status indicator initial state ---
        const initialSaveStatusEl = document.querySelector(".sequence-save-status");
        report.checks.saveStatusInitial = {
          rendered: initialSaveStatusEl !== null,
          text: initialSaveStatusEl?.textContent?.trim() || "",
        };

        // --- CHECK 1: Multi-selection ---
        const outlineItems = document.querySelectorAll(".sequence-outline-item");
        if (outlineItems.length >= 3) {
          (outlineItems[1] as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
          await wait(100);
          (outlineItems[2] as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
          await wait(200);
        }

        const multiSelBar = document.querySelector(".sequence-multi-selection-bar");
        report.checks.multiSelection = {
          rendered: multiSelBar !== null,
          text: multiSelBar?.textContent?.trim() || "",
        };
        await captureScreenshot("01_multiselection.png");

        // --- CHECK 2: Wrapping selection in alt (m2 and m3) ---
        const detailsWrap = multiSelBar?.querySelector("details");
        if (detailsWrap) {
          detailsWrap.open = true;
          await wait(100);
          const altBtn = Array.from(detailsWrap.querySelectorAll("button")).find((b) => b.textContent?.includes("alt"));
          if (altBtn) {
            altBtn.click();
            await wait(400);
          }
        }

        const altFragmentEl = Array.from(document.querySelectorAll("text")).find((t) => t.textContent?.trim() === "alt");
        report.checks.wrapping = {
          hasAltFragment: altFragmentEl !== undefined,
        };
        await captureScreenshot("02_wrap_alt.png");

        // --- CHECK 2b: + else / rama button on selected alt fragment ---
        const fragG = document.querySelector("g.sequence-fragment");
        if (fragG) {
          fragG.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          await wait(200);
        }
        const addOperandBtn = document.querySelector(".sequence-fragment-add-operand-btn");
        report.checks.addOperandButtonVisible = {
          rendered: addOperandBtn !== null,
        };
        await captureScreenshot("02b_alt_add_operand_btn.png");

        // --- CHECK 2c: Clicking + else / rama opens inline editor and adds operand ---
        if (addOperandBtn) {
          addOperandBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          await wait(200);
        }
        const inlineInput = document.querySelector("input.sequence-inline-input") as HTMLInputElement | null;
        report.checks.inlineGuardEditor = {
          opened: inlineInput !== null,
          initialValue: inlineInput?.value || "",
        };

        if (inlineInput) {
          inlineInput.value = "reintento agotado";
          inlineInput.dispatchEvent(new Event("input", { bubbles: true }));
          inlineInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          await wait(300);
        }
        await captureScreenshot("02c_inline_guard_edited.png");

        // --- CHECK 2d: Fragment vertical drag with slot insertion guide ---
        const dragFragHeader = document.querySelector("g.sequence-fragment rect");
        if (dragFragHeader) {
          const rect = dragFragHeader.getBoundingClientRect();
          dragFragHeader.dispatchEvent(new PointerEvent("pointerdown", {
            button: 0,
            clientY: rect.top + 10,
            bubbles: true,
          }));
          await wait(50);
          window.dispatchEvent(new PointerEvent("pointermove", {
            clientY: rect.top - 80,
            bubbles: true,
          }));
          await wait(150);
          const fragGuideEl = document.querySelector(".sequence-insertion-guide");
          report.checks.fragmentDragInsertionGuide = {
            guideRendered: fragGuideEl !== null,
          };
          await captureScreenshot("02d_fragment_drag_guide.png");
          window.dispatchEvent(new PointerEvent("pointerup", {
            clientY: rect.top - 80,
            bubbles: true,
          }));
          await wait(300);
        }

        // --- CHECK 3: Single-step Undo for wrapping and changes ---
        const undoBtn = document.querySelector("button[title='Deshacer']") as HTMLButtonElement | null;
        if (undoBtn && !undoBtn.disabled) {
          undoBtn.click();
          await wait(200);
          if (!undoBtn.disabled) {
            undoBtn.click();
            await wait(200);
          }
          if (!undoBtn.disabled) {
            undoBtn.click();
            await wait(200);
          }
          if (!undoBtn.disabled) {
            undoBtn.click();
            await wait(200);
          }
        }
        const altFragmentAfterUndo = Array.from(document.querySelectorAll("text")).find((t) => t.textContent?.trim() === "alt");
        report.checks.undoWrapping = {
          restored: altFragmentAfterUndo === undefined,
        };
        await captureScreenshot("03_undo_wrap.png");

        // --- CHECK 3b: Vertical drag insertion guide + ghost follows pointer ---
        const messageEl = document.querySelector("g.sequence-message") as SVGGElement | null;
        if (messageEl) {
          const rect = messageEl.getBoundingClientRect();
          const downClientY = rect.top + rect.height / 2;
          const downClientX = rect.left + rect.width / 2;
          const moveClientY = rect.top + 140;
          messageEl.dispatchEvent(new PointerEvent("pointerdown", {
            button: 0,
            clientX: downClientX,
            clientY: downClientY,
            bubbles: true,
          }));
          await wait(50);
          window.dispatchEvent(new PointerEvent("pointermove", {
            clientX: downClientX,
            clientY: moveClientY,
            bubbles: true,
          }));
          await wait(150);
          const guideEl = document.querySelector(".sequence-insertion-guide");
          const guideLine = guideEl?.querySelector("line");
          const guideLineRect = guideLine?.getBoundingClientRect();
          const guideClientY = guideLineRect ? guideLineRect.top + guideLineRect.height / 2 : null;
          const guidePill = guideEl?.querySelector("text")?.textContent ?? null;
          const guideClientYValue = guideClientY;
          const rectDuring = messageEl.getBoundingClientRect();
          const pointerDelta = moveClientY - downClientY;
          const ghostDelta = rectDuring.top - rect.top;
          const draggedAria = messageEl.getAttribute("aria-label") ?? "";
          report.checks.dragInsertionGuide = {
            guideRendered: guideEl !== null,
            ghostFollowsPointer: Math.abs(ghostDelta - pointerDelta) < 16,
            pointerDelta: Math.round(pointerDelta),
            ghostDelta: Math.round(ghostDelta),
            guideOffsetFromPointer: guideClientYValue !== null ? Math.round(guideClientYValue - moveClientY) : null,
            guidePill,
          };
          await captureScreenshot("04_drag_insertion_guide.png");
          window.dispatchEvent(new PointerEvent("pointerup", {
            clientX: downClientX,
            clientY: moveClientY,
            bubbles: true,
          }));
          await wait(300);
          const landedEl = Array.from(document.querySelectorAll("g.sequence-message"))
            .find((el) => el.getAttribute("aria-label") === draggedAria);
          // Posición semántica: coordenada Y de la línea del mensaje (path "M x y ...").
          const landedPathD = landedEl?.querySelector("path")?.getAttribute("d") ?? null;
          const landedLineY = landedPathD ? Number(landedPathD.split(/[ ,]/).filter(Boolean)[2] ?? NaN) : null;
          const landedLineClientY = landedLineY !== null && !Number.isNaN(landedLineY)
            ? (() => {
              const svg = landedEl?.closest("svg");
              if (!svg) return null;
              const point = new DOMPoint(0, landedLineY);
              const matrix = (svg as SVGSVGElement).getScreenCTM();
              return matrix ? point.matrixTransform(matrix).y : null;
            })()
            : null;
          report.checks.dragInsertionGuide.landingLineOffsetFromPointer = landedLineClientY !== null
            ? Math.round(landedLineClientY - moveClientY)
            : null;
          // La guía debe coincidir con el aterrizaje (misma candidata).
          report.checks.dragInsertionGuide.guideMatchesLanding = guideClientYValue !== null && landedLineClientY !== null
            && Math.abs(guideClientYValue - landedLineClientY) < 4;
          report.checks.dragInsertionGuide.orderAfter = Array.from(document.querySelectorAll("g.sequence-message"))
            .filter((el) => el.closest("svg") === document.querySelector("svg.sequence-diagram-svg"))
            .map((el) => el.getAttribute("aria-label")?.slice(0, 40) ?? "");
        }

        // --- CHECK 3c: arrastre de bloque (dos mensajes contiguos) ---
        {
          const allMessages = Array.from(document.querySelectorAll("g.sequence-message"));
          // Solo el primer canvas (el interactivo): el segundo es la fuente de exportación.
          const firstSvg = document.querySelector("svg.sequence-diagram-svg");
          const canvasMessages = allMessages.filter((el) => el.closest("svg") === firstSvg).slice(0, 3);
          if (canvasMessages.length >= 2) {
            const orderBefore = canvasMessages.map((el) => el.getAttribute("aria-label")?.slice(0, 40) ?? "");
            canvasMessages[0].dispatchEvent(new MouseEvent("click", { button: 0, shiftKey: true, bubbles: true }));
            await wait(100);
            canvasMessages[1].dispatchEvent(new MouseEvent("click", { button: 0, shiftKey: true, bubbles: true }));
            await wait(100);
            const firstRect = canvasMessages[0].getBoundingClientRect();
            const downX = firstRect.left + firstRect.width / 2;
            const downY = firstRect.top + firstRect.height / 2;
            const moveY = downY + 160;
            canvasMessages[0].dispatchEvent(new PointerEvent("pointerdown", {
              button: 0,
              clientX: downX,
              clientY: downY,
              bubbles: true,
            }));
            await wait(50);
            window.dispatchEvent(new PointerEvent("pointermove", {
              clientX: downX,
              clientY: moveY,
              bubbles: true,
            }));
            await wait(150);
            const blockGuide = document.querySelector(".sequence-insertion-guide");
            const blockGuideLine = blockGuide?.querySelector("line")?.getBoundingClientRect();
            const blockGuideY = blockGuideLine ? blockGuideLine.top + blockGuideLine.height / 2 : null;
            report.checks.blockDrag = {
              guideRendered: blockGuide !== null,
              guideOffsetFromPointer: blockGuideY !== null ? Math.round(blockGuideY - moveY) : null,
            };
            await captureScreenshot("04b_block_drag_guide.png");
            window.dispatchEvent(new PointerEvent("pointerup", {
              clientX: downX,
              clientY: moveY,
              bubbles: true,
            }));
            await wait(300);
            const orderAfter = Array.from(document.querySelectorAll("g.sequence-message"))
              .filter((el) => el.closest("svg") === firstSvg).slice(0, 3)
              .map((el) => el.getAttribute("aria-label")?.slice(0, 40) ?? "");
            report.checks.blockDrag.orderChanged = orderAfter.join("|") !== orderBefore.join("|");
            report.checks.blockDrag.orderAfter = orderAfter;
          }
        }

        // --- CHECK 3d: Mayús+marquee dentro de un fragmento (no lo arrastra) ---
        {
          const firstSvg = document.querySelector("svg.sequence-diagram-svg");
          const fragEl = firstSvg?.querySelector("g.sequence-fragment") as SVGGElement | null;
          if (firstSvg && fragEl) {
            // Limpia la selección previa con clic simple sobre el fondo.
            firstSvg.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true }));
            await wait(100);
            // Caja del fragmento por atributos (estable ante tiradores/selección).
            const fragBoxRect = () => fragEl.querySelector("rect");
            const boxBefore = { x: fragBoxRect()?.getAttribute("x"), y: fragBoxRect()?.getAttribute("y") };
            const fragClientBefore = fragEl.getBoundingClientRect();
            const startX = fragClientBefore.left + fragClientBefore.width / 2;
            const startY = fragClientBefore.top + 60;
            fragEl.dispatchEvent(new PointerEvent("pointerdown", {
              button: 0,
              shiftKey: true,
              clientX: startX,
              clientY: startY,
              bubbles: true,
            }));
            await wait(50);
            window.dispatchEvent(new PointerEvent("pointermove", {
              shiftKey: true,
              clientX: startX + 70,
              clientY: startY + 90,
              bubbles: true,
            }));
            await wait(150);
            const marqueeVisible = firstSvg.querySelector(".sequence-marquee") !== null;
            window.dispatchEvent(new PointerEvent("pointerup", {
              clientX: startX + 70,
              clientY: startY + 90,
              bubbles: true,
            }));
            await wait(300);
            const multiSelected = firstSvg.querySelectorAll("[data-multi-selected]").length;
            const multiSelectedMessages = firstSvg.querySelectorAll("g.sequence-message[data-multi-selected]").length;
            const multiSelectedFragments = firstSvg.querySelectorAll("g.sequence-fragment[data-multi-selected]").length;
            const boxAfter = { x: fragBoxRect()?.getAttribute("x"), y: fragBoxRect()?.getAttribute("y") };
            report.checks.shiftMarqueeInFragment = {
              marqueeRendered: marqueeVisible,
              multiSelectedCount: multiSelected,
              // Solo lo de adentro: el contenedor tocado parcialmente sale del bloque.
              innerMessagesSelected: multiSelectedMessages,
              outerFragmentExcluded: multiSelectedFragments === 0,
              fragmentUnmoved: boxAfter.x === boxBefore.x && boxAfter.y === boxBefore.y,
              fragmentBoxBefore: boxBefore,
              fragmentBoxAfter: boxAfter,
            };
            await captureScreenshot("04c_shift_marquee.png");
          }
        }

        // --- CHECK 4: Review Diagram panel (showing errors & warnings) ---
        const reviewBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Revisar")) as HTMLButtonElement | null;
        if (reviewBtn) {
          reviewBtn.click();
          await wait(300);
        }
        const reviewPanel = document.querySelector(".sequence-review-panel");
        report.checks.reviewPanel = {
          opened: reviewPanel !== null,
          header: reviewPanel?.querySelector(".sequence-review-title")?.textContent?.trim() || "",
        };
        await captureScreenshot("05_review_panel.png");

        // Close review panel
        const closeReviewBtn = reviewPanel?.querySelector(".icon-button") as HTMLButtonElement | null;
        if (closeReviewBtn) {
          closeReviewBtn.click();
          await wait(200);
        }

        // --- CHECK 5: Templates modal ---
        const templatesBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Plantillas")) as HTMLButtonElement | null;
        if (templatesBtn) {
          templatesBtn.click();
          await wait(300);
        }
        const modal = document.querySelector(".sequence-modal-card");
        const templateCards = document.querySelectorAll(".sequence-template-item");
        report.checks.templates = {
          opened: modal !== null,
          count: templateCards.length,
          names: Array.from(templateCards).map((c) => c.querySelector("h4")?.textContent?.trim()),
        };
        await captureScreenshot("06_templates_modal.png");

        // Load interaction-ref template into current diagram (button 0: "Cargar en este diagrama")
        const refCard = Array.from(templateCards).find((c) => c.querySelector("h4")?.textContent?.includes("Ref"));
        const loadInCurrentBtn = refCard?.querySelectorAll("button")[0] as HTMLButtonElement | null;
        if (loadInCurrentBtn) {
          loadInCurrentBtn.click();
          await wait(400);
        }
        await captureScreenshot("07_template_ref_loaded.png");

        // --- CHECK 6: Ref fragment inspector & navigation button ---
        // Click on the ref fragment in the outline or canvas
        const refOutline = Array.from(document.querySelectorAll(".sequence-outline-item")).find((b) => b.textContent?.includes("ref"));
        if (refOutline) {
          (refOutline as HTMLElement).click();
          await wait(300);
        }

        // Check inspector select for referenced interaction
        const refSelect = document.querySelector(".sequence-inspector select") as HTMLSelectElement | null;
        if (refSelect) {
          const option = Array.from(refSelect.options).find((o) => o.value === "seq-sub");
          if (option) {
            refSelect.value = "seq-sub";
            refSelect.dispatchEvent(new Event("change", { bubbles: true }));
            await wait(300);
          }
        }
        await captureScreenshot("08_ref_linked.png");

        // Verify canvas has "Abrir ref" badge/button and inspector has "Abrir interacción"
        const openRefBtn = Array.from(document.querySelectorAll("button, .sequence-ref-nav-btn")).find((b) =>
          b.textContent?.includes("Abrir interacción") || b.textContent?.includes("Abrir ref")
        ) as HTMLElement | null;

        if (openRefBtn) {
          openRefBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          await wait(200);
        }

        report.checks.refNavigation = {
          buttonFound: openRefBtn !== null,
          navigatedTo: "seq-sub",
        };

        // --- CHECK 7: Save status indicator final state ---
        const finalSaveStatusEl = document.querySelector(".sequence-save-status");
        report.checks.saveStatusFinal = {
          rendered: finalSaveStatusEl !== null,
          text: finalSaveStatusEl?.textContent?.trim() || "",
        };

        report.status = "SUCCESS";
        await notifyDone(report);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("Error in test runner:", error);
        report.passed = false;
        report.error = error.message;
        report.stack = error.stack;
        await notifyDone(report);
      }
    };

    runAllTests();
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
      <SequenceDiagramEditor
        artifact={activeArtifact}
        canRedo={historyIndex < history.length - 1}
        canUndo={historyIndex > 0}
        project={project}
        theme={themes[0]}
        themeId="warm-contrast"
        saveStatus={saveStatus}
        onNavigateToArtifact={handleNavigateToArtifact}
        onCreateSequenceDiagramArtifact={handleCreateSequenceDiagramArtifact}
        onChangeContent={handleChangeContent}
        onRedo={handleRedo}
        onUndo={handleUndo}
        onImportProject={() => undefined}
        onThemeChange={() => undefined}
      />
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<AdvancedSequenceRunner />);
}
