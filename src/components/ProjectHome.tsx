import { Blocks, FolderOpen, Plus, Search, ShieldCheck, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { DesignArtifact, DesignProject } from '../types/diagram';
import { IMPORT_INVALID_MESSAGE, IMPORT_UNREADABLE_MESSAGE, extractImportableProjects } from '../utils/projectImport';
import type { BackupState } from '../storage/backup';
import { projectInitials } from '../utils/projectInitials';
import { ARTIFACT_TYPES, artifactTypeInfo } from '../constants/artifactTypes';
import { ArtifactTypeIcon } from './ArtifactTypeIcon';

type ProjectHomeProps = {
  projects: DesignProject[];
  onCreateProject: () => void;
  onImportProject: (project: DesignProject) => void;
  /** Many projects at once (a backup of the first version); skips ones already here. */
  onImportProjects: (projects: DesignProject[]) => { imported: number; skipped: number };
  onOpenProject: (projectId: string) => void;
  backup: BackupState;
  backupAvailable: boolean;
  onRevealBackups: () => void;
};

/** The shell mirrors projects to ~/Documents; this says so without alarming. */
const backupStatusLabel = (backup: BackupState): string => {
  if (backup.error !== null) return `No se pudo respaldar en disco: ${backup.error}`;
  if (backup.at === null) return 'Se guarda una copia en Documentos mientras trabajás.';

  const minutes = Math.round((Date.now() - backup.at) / 60000);
  if (minutes < 1) return 'Copia en Documentos actualizada recién.';
  if (minutes < 60) return `Copia en Documentos de hace ${minutes} min.`;

  const date = new Date(backup.at);
  return `Copia en Documentos del ${date.toLocaleDateString('es-AR')} a las ${date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.`;
};

type ArtifactKind = DesignArtifact['type'];

const formatProjectDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  const now = new Date();
  const time = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(date);
  if (date.toDateString() === now.toDateString()) return `Editado hoy, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Editado ayer, ${time}`;
  return `Editado el ${new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)}`;
};

const stableProjectTone = (id: string): string => {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  const mixedHash = (hash ^ (hash >>> 8)) >>> 0;
  return String.fromCharCode(97 + (mixedHash % 7));
};

/** Artifact types of a project in the canonical order, with how many of each. */
const artifactCounts = (project: DesignProject): Array<{ type: ArtifactKind; count: number }> =>
  ARTIFACT_TYPES
    .map((type) => ({ type: type.id, count: project.artifacts.filter((artifact) => artifact.type === type.id).length }))
    .filter((entry) => entry.count > 0);

const formatArtifactSummary = (project: DesignProject): string => {
  const summary = artifactCounts(project).map(({ type, count }) => {
    const [singular, plural] = artifactTypeInfo(type).countLabel;
    return `${count} ${count === 1 ? singular : plural}`;
  });
  return summary.length > 0 ? summary.join(' · ') : 'Sin artefactos todavía';
};

export function ProjectHome({ projects, onCreateProject, onImportProject, onImportProjects, onOpenProject, backup, backupAvailable, onRevealBackups }: ProjectHomeProps) {
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return projects;
    return projects.filter((project) => `${project.name} ${project.artifacts.map((artifact) => artifact.name).join(' ')}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [projects, query]);

  // One exported project behaves as always (imported as a copy if it is
  // already here). A backup of the first version — or several files at once —
  // brings every project in it and skips the ones already imported.
  const handleImport = async (files: File[]): Promise<void> => {
    try {
      const found: DesignProject[] = [];
      let unreadable = 0;
      for (const file of files) {
        try {
          const projectsInFile = extractImportableProjects(JSON.parse(await file.text()) as unknown);
          if (projectsInFile === null) unreadable += 1;
          else found.push(...projectsInFile);
        } catch {
          unreadable += 1;
        }
      }
      if (found.length === 0) {
        setFeedback({ tone: 'error', message: unreadable > 0 && files.length === 1 ? IMPORT_INVALID_MESSAGE : IMPORT_UNREADABLE_MESSAGE });
        return;
      }
      if (found.length === 1 && files.length === 1) {
        onImportProject(found[0]);
        setFeedback({ tone: 'success', message: 'Proyecto importado.' });
        return;
      }
      const { imported, skipped } = onImportProjects(found);
      if (imported === 0) {
        setFeedback({ tone: 'success', message: skipped === 1 ? 'Ese proyecto ya estaba; no se duplicó.' : `Esos ${skipped} proyectos ya estaban; no se duplicó nada.` });
        return;
      }
      const parts = [
        imported === 1 ? 'Se importó 1 proyecto' : `Se importaron ${imported} proyectos`,
        skipped > 0 ? `${skipped} ya ${skipped === 1 ? 'estaba' : 'estaban'} y no se ${skipped === 1 ? 'duplicó' : 'duplicaron'}` : '',
        unreadable > 0 ? `${unreadable} ${unreadable === 1 ? 'archivo no se pudo leer' : 'archivos no se pudieron leer'}` : '',
      ].filter(Boolean);
      setFeedback({ tone: 'success', message: `${parts.join('; ')}.` });
    } finally {
      if (fileInputRef.current !== null) fileInputRef.current.value = '';
    }
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      className="hidden-file-input"
      type="file"
      accept="application/json,.json"
      aria-label="Importar proyectos o un respaldo (JSON)"
      multiple
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        if (files.length > 0) void handleImport(files);
      }}
    />
  );

  const feedbackBanner = feedback !== null ? (
    <div className={`v2-home-feedback is-${feedback.tone}`} role="status">
      <span>{feedback.message}</span>
      <button aria-label="Cerrar aviso" className="v2-tool" type="button" onClick={() => setFeedback(null)}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  ) : null;

  const backupLine = backupAvailable ? (
    <p className="v2-home-backup">
      <ShieldCheck aria-hidden="true" size={14} />
      <span>{backupStatusLabel(backup)}</span>
      <button type="button" onClick={onRevealBackups}>Ver copias</button>
    </p>
  ) : null;

  if (projects.length === 0) {
    return (
      <main className="project-home v2-home is-empty" aria-labelledby="project-home-title">
        <section className="v2-home-welcome">
          <span className="v2-home-mark" aria-hidden="true"><Blocks size={26} /></span>
          <h1 id="project-home-title">Empezá un proyecto</h1>
          <p>Un proyecto reúne los casos de uso, los flujos, las secuencias y las clases de un sistema, listos para entregar en PDF o Word.</p>
          <div className="v2-home-welcome-actions">
            <button className="home-button home-button-primary" type="button" onClick={onCreateProject}>
              <Plus aria-hidden="true" size={16} />
              Nuevo proyecto
            </button>
            <button className="home-button" type="button" onClick={() => fileInputRef.current?.click()}>
              <Upload aria-hidden="true" size={15} />
              Importar proyecto…
            </button>
            {fileInput}
          </div>
          <p className="v2-home-migrate">
            ¿Venís de la versión anterior? Tocá <strong>Importar proyecto…</strong> y elegí el respaldo más reciente de
            <code>Documentos › Modelador de Sistemas › Respaldos</code>: trae todos tus proyectos de una vez.
          </p>
          {feedbackBanner}
          <ol className="v2-home-artifact-types" aria-label="Qué podés modelar">
            {ARTIFACT_TYPES.map((type) => (
              <li key={type.id}>
                <type.icon aria-hidden="true" size={15} />
                {type.label}
              </li>
            ))}
          </ol>
        </section>
        {backupLine}
      </main>
    );
  }

  return (
    <main className="project-home v2-home" aria-labelledby="project-home-title">
      <header className="v2-home-header">
        <div className="v2-home-title">
          <h1 id="project-home-title">Proyectos</h1>
          <span className="v2-home-count" aria-live="polite">
            {query ? `${filteredProjects.length} de ${projects.length}` : projects.length}
          </span>
        </div>
        <label className="v2-home-search">
          <Search aria-hidden="true" size={15} />
          <input
            type="search"
            value={query}
            placeholder="Buscar"
            aria-label="Buscar proyectos o artefactos"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="home-button" title="Importar proyectos exportados o un respaldo de la versión anterior" type="button" onClick={() => fileInputRef.current?.click()}>
          <Upload aria-hidden="true" size={15} />
          Importar…
        </button>
        <button className="home-button home-button-primary" type="button" onClick={onCreateProject}>
          <Plus aria-hidden="true" size={16} />
          Nuevo proyecto
        </button>
        {fileInput}
      </header>

      {feedbackBanner}

      {filteredProjects.length > 0 ? (
        <ul className="v2-home-grid" aria-label="Proyectos, del más reciente al más antiguo">
          {filteredProjects.map((project) => (
            <li key={project.id}>
              <button
                className="v2-project-card"
                data-project-tone={stableProjectTone(project.id)}
                type="button"
                onClick={() => onOpenProject(project.id)}
              >
                <span className="v2-project-card-cover" aria-hidden="true">
                  <span className="v2-project-card-initials">{projectInitials(project.name)}</span>
                  <span className="v2-project-card-types">
                    {artifactCounts(project).map(({ type }) => <ArtifactTypeIcon key={type} type={type} size={14} />)}
                  </span>
                </span>
                <span className="v2-project-card-body">
                  <strong>{project.name}</strong>
                  <span className="v2-project-card-summary">{formatArtifactSummary(project)}</span>
                  <span className="v2-project-card-date">{formatProjectDate(project.updatedAt)}</span>
                </span>
                <span className="v2-project-card-open" aria-hidden="true"><FolderOpen size={15} /></span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="v2-home-no-results">
          <Search aria-hidden="true" size={20} />
          <strong>No hay proyectos que coincidan con «{query}»</strong>
          <button className="home-button" type="button" onClick={() => setQuery('')}>Limpiar búsqueda</button>
        </div>
      )}

      {backupLine}
    </main>
  );
}
