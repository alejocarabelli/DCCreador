import {
  Boxes,
  GitBranch,
  Plus,
  Search,
  ShieldCheck,
  StickyNote,
  Upload,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { DesignArtifact, DesignProject } from '../types/diagram';
import { IMPORT_INVALID_MESSAGE, IMPORT_UNREADABLE_MESSAGE, isImportableProject } from '../utils/projectImport';
import type { BackupState } from '../storage/backup';
import { ProjectThumbnail } from './ProjectThumbnail';
import { normalizeDiagramProject } from '../utils/diagramNormalization';

type ProjectHomeProps = {
  projects: DesignProject[];
  onCreateProject: () => void;
  onImportProject: (project: DesignProject) => void;
  onOpenProject: (projectId: string) => void;
  backup: BackupState;
  backupAvailable: boolean;
  onRevealBackups: () => void;
};

/** The shell mirrors projects to ~/Documents; this says so without alarming. */
const backupStatusLabel = (backup: BackupState): string => {
  if (backup.error !== null) return `No se pudo respaldar en disco: ${backup.error}`;
  if (backup.at === null) return 'Se respaldará una copia en Documentos mientras trabajás.';

  const minutes = Math.round((Date.now() - backup.at) / 60000);
  if (minutes < 1) return 'Copia en Documentos actualizada recién.';
  if (minutes < 60) return `Copia en Documentos de hace ${minutes} min.`;

  const date = new Date(backup.at);
  return `Copia en Documentos del ${date.toLocaleDateString('es-AR')} a las ${date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.`;
};

type ArtifactKind = DesignArtifact['type'];

const artifactLabels: Record<ArtifactKind, [singular: string, plural: string]> = {
  'class-diagram': ['clase', 'clases'],
  'class-sequence-diagram': ['diagrama de clases (secuencia)', 'diagramas de clases (secuencia)'],
  'use-case-model': ['modelo de casos de uso', 'modelos de casos de uso'],
  'use-case-flow': ['flujo', 'flujos'],
  'sequence-diagram': ['secuencia', 'secuencias'],
};

/** The row shows one date, so the time of day is dropped: it never decides
    which project you are looking for. */
const formatProjectDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Editado hoy';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Editado ayer';

  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

/** Connectors carry no identity: "Rescate de animales" must not read as RD.
    Two letters still cannot separate twenty projects, which is why the cover is
    a schematic of the diagram and these initials are only the fallback. */
const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'a', 'al', 'en', 'para', 'por', 'con', 'un', 'una']);

const projectInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';

  const meaningful = words.filter((word) => !CONNECTORS.has(word.toLocaleLowerCase()));
  const source = meaningful.length > 0 ? meaningful : words;
  if (source.length === 1) return source[0].slice(0, 2).toUpperCase();
  return `${source[0][0]}${source[1][0]}`.toUpperCase();
};

const stableProjectTone = (id: string): string => {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  const mixedHash = (hash ^ (hash >>> 8)) >>> 0;
  return String.fromCharCode(97 + (mixedHash % 7));
};

const countArtifactKinds = (project: DesignProject): Map<ArtifactKind, number> => {
  const counts = new Map<ArtifactKind, number>();
  project.artifacts.forEach((artifact) => counts.set(artifact.type, (counts.get(artifact.type) ?? 0) + 1));
  return counts;
};

const formatArtifactSummary = (project: DesignProject): string => {
  const counts = countArtifactKinds(project);
  const summary = Array.from(counts.entries()).map(([type, count]) => {
    const [singular, plural] = artifactLabels[type];
    return `${count} ${count === 1 ? singular : plural}`;
  });
  return summary.length > 0 ? summary.join(' · ') : 'Sin artefactos todavía';
};

const artifactIcon = (type: ArtifactKind) => {
  if (type === 'class-diagram') return <Boxes aria-hidden="true" size={14} />;
  if (type === 'class-sequence-diagram') return <GitBranch aria-hidden="true" size={14} />;
  if (type === 'use-case-model') return <UsersRound aria-hidden="true" size={14} />;
  if (type === 'use-case-flow') return <Workflow aria-hidden="true" size={14} />;
  return <GitBranch aria-hidden="true" size={14} />;
};

export function ProjectHome({ projects, onCreateProject, onImportProject, onOpenProject, backup, backupAvailable, onRevealBackups }: ProjectHomeProps) {
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matching = normalizedQuery
      ? projects.filter((project) => `${project.name} ${formatArtifactSummary(project)}`.toLocaleLowerCase().includes(normalizedQuery))
      : projects;

    // The header claims this order, so it has to be true.
    return [...matching].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [projects, query]);

  const handleImport = async (file: File): Promise<void> => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isImportableProject(parsed)) {
        setFeedback(IMPORT_INVALID_MESSAGE);
        return;
      }
      onImportProject(normalizeDiagramProject(parsed));
      setFeedback('Proyecto importado.');
    } catch {
      setFeedback(IMPORT_UNREADABLE_MESSAGE);
    } finally {
      if (fileInputRef.current !== null) fileInputRef.current.value = '';
    }
  };

  const countLabel = `${projects.length} ${projects.length === 1 ? 'proyecto' : 'proyectos'}`;

  return (
    <main className="project-home" aria-labelledby="project-home-title">
      <header className="project-home-header">
        <div>
          <h1 id="project-home-title">Tus proyectos</h1>
          <p>Reuní tus diagramas y especificaciones en un mismo archivo técnico.</p>
        </div>
        <div className="project-home-actions">
          <span className="project-home-count" aria-live="polite">{query ? `${filteredProjects.length} de ${countLabel}` : countLabel}</span>
          <button className="home-button" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload aria-hidden="true" size={15} />
            Importar
          </button>
          <button className="home-button home-button-primary" type="button" onClick={onCreateProject}>
            <Plus aria-hidden="true" size={15} />
            Nuevo proyecto
          </button>
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            accept="application/json,.json"
            aria-label="Importar proyecto JSON"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) void handleImport(file);
            }}
          />
        </div>
      </header>

      <div className="project-home-toolbar">
        <label className="project-home-search">
          <Search aria-hidden="true" size={16} />
          <input
            type="search"
            value={query}
            placeholder="Buscar proyectos…"
            aria-label="Buscar proyectos"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span>Ordenados por última edición</span>
      </div>

      {backupAvailable ? (
        <p className="project-home-backup">
          <ShieldCheck aria-hidden="true" size={14} />
          <span>{backupStatusLabel(backup)}</span>
          <button type="button" onClick={onRevealBackups}>Ver copias</button>
        </p>
      ) : null}

      {feedback !== null ? <div className="project-home-feedback" role="status">{feedback}</div> : null}

      {filteredProjects.length > 0 ? (
        <div className="project-home-list" role="list" aria-label="Proyectos">
          {filteredProjects.map((project) => {
            const dateLabel = formatProjectDate(project.updatedAt);
            const artifactTypes = Array.from(countArtifactKinds(project).keys());
            return (
              <button
                className="project-home-row"
                data-project-tone={stableProjectTone(project.id)}
                key={project.id}
                type="button"
                aria-label={`Abrir proyecto ${project.name}`}
                onClick={() => onOpenProject(project.id)}
              >
                <ProjectThumbnail fallback={projectInitials(project.name)} project={project} />
                <span className="project-home-copy">
                  <strong>{project.name}</strong>
                  <span className="project-home-artifacts">
                    {artifactTypes.slice(0, 3).map((type) => <span key={type}>{artifactIcon(type)}</span>)}
                    {artifactTypes.length === 0 ? <span><StickyNote size={14} /></span> : null}
                    {formatArtifactSummary(project)}
                  </span>
                </span>
                <span className="project-home-date">{dateLabel}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="project-home-empty">
          <Search aria-hidden="true" size={22} />
          <strong>{projects.length === 0 ? 'Todavía no hay proyectos' : 'No encontramos proyectos'}</strong>
          <span>{projects.length === 0 ? 'Creá tu primer archivo técnico para empezar.' : 'Probá con otro nombre o limpiá la búsqueda.'}</span>
          <button type="button" onClick={projects.length === 0 ? onCreateProject : () => setQuery('')}>
            {projects.length === 0 ? 'Crear proyecto' : 'Limpiar búsqueda'}
          </button>
        </div>
      )}
    </main>
  );
}
