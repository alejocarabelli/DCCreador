import type { DesignArtifact } from '../types/diagram';
import { artifactTypeInfo } from '../constants/artifactTypes';

type ArtifactTypeIconProps = {
  type: DesignArtifact['type'];
  size?: number;
};

/** One glyph per artifact type, shared by the sidebar, the breadcrumb and the home screen. */
export function ArtifactTypeIcon({ type, size = 15 }: ArtifactTypeIconProps) {
  const Icon = artifactTypeInfo(type).icon;
  return <Icon aria-hidden="true" size={size} />;
}
