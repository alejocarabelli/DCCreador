import type { AssociationRelationType } from '../types/diagram';

export const ASSOCIATION_RELATION_LABELS: Record<AssociationRelationType, string> = {
  association: 'Asociación',
  generalization: 'Herencia / generalización',
  aggregation: 'Agregación',
  composition: 'Composición',
  dependency: 'Dependencia',
  realization: 'Realización',
};
