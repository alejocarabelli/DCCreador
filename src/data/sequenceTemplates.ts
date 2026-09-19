import type { SequenceDiagramContent, SequenceParticipant, SequenceMessage, SequenceMessageType } from '../types/diagram';
import { createId } from '../utils/id';

export type SequenceTemplateMetadata = {
  id: string;
  name: string;
  description: string;
  category: string;
};

export type SequenceTemplate = SequenceTemplateMetadata & {
  createContent: () => SequenceDiagramContent;
};

const createTemplateMsg = (params: {
  id?: string;
  type?: SequenceMessageType;
  sourceId: string;
  targetId: string;
  name: string;
  arguments?: string;
  parameterValues?: string;
  returnType?: string;
  flowReference?: string;
}): SequenceMessage => ({
  id: params.id || createId(),
  kind: 'message',
  type: params.type || 'synchronous',
  sourceId: params.sourceId,
  targetId: params.targetId,
  name: params.name,
  arguments: params.arguments || '',
  parameterValues: params.parameterValues || '',
  returnType: params.returnType || '',
  flowReference: params.flowReference || '',
});

export const SEQUENCE_TEMPLATES: SequenceTemplate[] = [
  {
    id: 'auth-jwt',
    name: 'Autenticación con JWT',
    description: 'Flujo de inicio de sesión con validación de credenciales, manejo de errores en fragmento alt y generación de token.',
    category: 'Seguridad',
    createContent: () => {
      const pUser: SequenceParticipant = { id: createId(), kind: 'actor', name: 'Usuario', classifierName: '', x: 120 };
      const pClient: SequenceParticipant = { id: createId(), kind: 'boundary', name: 'Cliente Web', classifierName: '', x: 340 };
      const pAuth: SequenceParticipant = { id: createId(), kind: 'control', name: 'AuthService', classifierName: 'AuthService', x: 580 };
      const pDb: SequenceParticipant = { id: createId(), kind: 'entity', name: 'UserDB', classifierName: 'UserDB', x: 820 };

      const mLogin = createTemplateMsg({
        sourceId: pUser.id,
        targetId: pClient.id,
        name: 'ingresarCredenciales',
        arguments: 'email, password',
      });

      const mPost = createTemplateMsg({
        sourceId: pClient.id,
        targetId: pAuth.id,
        name: 'login',
        arguments: 'email, hash(password)',
      });

      const mQuery = createTemplateMsg({
        sourceId: pAuth.id,
        targetId: pDb.id,
        name: 'findUserByEmail',
        arguments: 'email',
      });

      const mDbResult = createTemplateMsg({
        type: 'return',
        sourceId: pDb.id,
        targetId: pAuth.id,
        name: 'userRecord',
      });

      const mOkToken = createTemplateMsg({
        type: 'return',
        sourceId: pAuth.id,
        targetId: pClient.id,
        name: 'jwtToken',
        returnType: 'String',
      });

      const mErr = createTemplateMsg({
        type: 'return',
        sourceId: pAuth.id,
        targetId: pClient.id,
        name: '401 Unauthorized',
      });

      const altFragment = {
        id: createId(),
        kind: 'fragment' as const,
        operator: 'alt' as const,
        name: 'Verificación de credenciales',
        operands: [
          {
            id: createId(),
            guard: 'credenciales válidas',
            items: [mOkToken],
          },
          {
            id: createId(),
            guard: 'else',
            items: [mErr],
          },
        ],
      };

      return {
        version: 1,
        numbering: 'sequential',
        showActivations: true,
        participants: [pUser, pClient, pAuth, pDb],
        items: [mLogin, mPost, mQuery, mDbResult, altFragment],
        activations: [],
        problems: [],
        notes: [
          {
            id: createId(),
            text: 'Muestra uso de participantes especializados y fragmento alternativo alt.',
            x: 70,
            y: 460,
            width: 250,
            height: 90,
            anchorKind: 'free',
          },
        ],
        canvas: { width: 1400, height: 800 },
      };
    },
  },
  {
    id: 'order-processing',
    name: 'Procesamiento de Pedidos',
    description: 'Proceso de compra con verificación de stock en bucle (loop) y confirmación opcional (opt).',
    category: 'Comercio',
    createContent: () => {
      const pBuyer: SequenceParticipant = { id: createId(), kind: 'actor', name: 'Comprador', classifierName: '', x: 120 };
      const pStore: SequenceParticipant = { id: createId(), kind: 'boundary', name: 'Portal', classifierName: '', x: 340 };
      const pOrderMgr: SequenceParticipant = { id: createId(), kind: 'control', name: 'OrderManager', classifierName: 'OrderManager', x: 580 };
      const pStock: SequenceParticipant = { id: createId(), kind: 'entity', name: 'Inventario', classifierName: 'StockService', x: 820 };

      const mCheckout = createTemplateMsg({
        sourceId: pBuyer.id,
        targetId: pStore.id,
        name: 'confirmarCompra',
        arguments: 'carrito',
      });

      const mProcess = createTemplateMsg({
        sourceId: pStore.id,
        targetId: pOrderMgr.id,
        name: 'procesarPedido',
        arguments: 'items',
      });

      const mCheckStock = createTemplateMsg({
        sourceId: pOrderMgr.id,
        targetId: pStock.id,
        name: 'verificarStock',
        arguments: 'itemId, cantidad',
      });

      const loopFragment = {
        id: createId(),
        kind: 'fragment' as const,
        operator: 'loop' as const,
        name: 'Por cada producto',
        operands: [
          {
            id: createId(),
            guard: 'cada item en carrito',
            items: [mCheckStock],
          },
        ],
      };

      const mNotify = createTemplateMsg({
        type: 'asynchronous',
        sourceId: pOrderMgr.id,
        targetId: pBuyer.id,
        name: 'notificarEnvio',
        arguments: 'trackingNumber',
      });

      const optFragment = {
        id: createId(),
        kind: 'fragment' as const,
        operator: 'opt' as const,
        name: 'Notificación por email',
        operands: [
          {
            id: createId(),
            guard: 'notificaciones activas',
            items: [mNotify],
          },
        ],
      };

      return {
        version: 1,
        numbering: 'sequential',
        showActivations: true,
        participants: [pBuyer, pStore, pOrderMgr, pStock],
        items: [mCheckout, mProcess, loopFragment, optFragment],
        activations: [],
        problems: [],
        notes: [],
        canvas: { width: 1400, height: 800 },
      };
    },
  },
  {
    id: 'interaction-ref',
    name: 'Subproceso con Fragmento Ref',
    description: 'Demuestra la modularización de interacciones utilizando un fragmento de tipo ref (InteractionUse).',
    category: 'Modularización',
    createContent: () => {
      const pClient: SequenceParticipant = { id: createId(), kind: 'boundary', name: 'App', classifierName: '', x: 140 };
      const pService: SequenceParticipant = { id: createId(), kind: 'control', name: 'PagoController', classifierName: 'PagoController', x: 420 };
      const pGateway: SequenceParticipant = { id: createId(), kind: 'boundary', name: 'PasarelaPago', classifierName: '', x: 700 };

      const mStart = createTemplateMsg({
        sourceId: pClient.id,
        targetId: pService.id,
        name: 'iniciarPago',
        arguments: 'monto, medioPago',
      });

      const refFragment = {
        id: createId(),
        kind: 'fragment' as const,
        operator: 'ref' as const,
        name: 'Autorización Bancaria',
        operands: [
          {
            id: createId(),
            guard: '',
            items: [],
          },
        ],
      };

      const mConfirm = createTemplateMsg({
        sourceId: pService.id,
        targetId: pGateway.id,
        name: 'capturarFondos',
        arguments: 'authCode',
      });

      const mResult = createTemplateMsg({
        type: 'return',
        sourceId: pService.id,
        targetId: pClient.id,
        name: 'comprobantePago',
      });

      return {
        version: 1,
        numbering: 'sequential',
        showActivations: true,
        participants: [pClient, pService, pGateway],
        items: [mStart, refFragment, mConfirm, mResult],
        activations: [],
        problems: [],
        notes: [
          {
            id: createId(),
            text: 'El fragmento ref permite descomponer sistemas complejos en diagramas interconectados.',
            x: 90,
            y: 380,
            width: 280,
            height: 80,
            anchorKind: 'free',
          },
        ],
        canvas: { width: 1400, height: 750 },
      };
    },
  },
];

export const instantiateSequenceTemplate = (templateId: string): SequenceDiagramContent | null => {
  const template = SEQUENCE_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return null;
  return template.createContent();
};
