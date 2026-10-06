import type { AssociationLineStyle } from '../types/diagram';
import { readUiPreference, writeUiPreference } from './uiPreferences';

const ASSOCIATION_LINE_STYLE_KEY = 'modelador.associationLineStyle';

export const readAssociationLineStyle = (): AssociationLineStyle =>
  readUiPreference(ASSOCIATION_LINE_STYLE_KEY) === 'straight' ? 'straight' : 'orthogonal';

export const writeAssociationLineStyle = (lineStyle: AssociationLineStyle): boolean =>
  writeUiPreference(ASSOCIATION_LINE_STYLE_KEY, lineStyle);
