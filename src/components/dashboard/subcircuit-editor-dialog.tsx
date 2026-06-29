'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Boxes, Cable, Plus, Save, Search, Trash2 } from 'lucide-react';

import { COMPONENT_TEMPLATES } from '@/constants/component-templates';
import { formatCanvasComponentName } from '@/lib/component-display-name';
import { getComponentPinLayout } from '@/lib/component-pin-layout';
import {
  normalizeSubCircuitEditorState,
  type SubCircuitPortCandidate,
} from '@/lib/subcircuits';
import type {
  ComponentTemplate,
  ManualNetConnection,
  ManualPadEndpoint,
  PlacedComponent,
  SubCircuitPortMapping,
  SubCircuitTemplate,
  SubCircuitTemplateUpdate,
} from '@/types';
import { toast } from 'sonner';

type EditorInternalNodeData = {
  component: PlacedComponent;
  template: ComponentTemplate | undefined;
};

type EditorPortNodeData = {
  externalPinId: string;
  sourceLabel: string;
  detail: string;
};

type EditorState = {
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  portMappings: SubCircuitPortMapping[];
};

const FEATURED_INTERNAL_TEMPLATE_IDS = [
  'tpl_resistor',
  'tpl_led',
  'tpl_button',
  'tpl_diode',
  'tpl_capacitor',
  'tpl_transistor_npn',
  'tpl_buzzer',
  'tpl_op_amp_buffer',
] as const;

function cloneEndpoint(endpoint: ManualPadEndpoint): ManualPadEndpoint {
  return {
    ownerType: endpoint.ownerType,
    ownerId: endpoint.ownerId,
    pinId: endpoint.pinId,
  };
}

function cloneEditorState(template: SubCircuitTemplate): EditorState {
  return {
    components: template.internalState.components.map(component => ({
      ...component,
      assignedPins: { ...component.assignedPins },
      position: { ...component.position },
    })),
    manualConnections: template.internalState.manualConnections.map(connection => ({
      ...connection,
      source: cloneEndpoint(connection.source),
      target: cloneEndpoint(connection.target),
    })),
    portMappings: template.portMappings.map(port => ({
      externalPinId: port.externalPinId,
      internalEndpoint: cloneEndpoint(port.internalEndpoint),
      internalComponentName: port.internalComponentName,
      internalPinLabel: port.internalPinLabel,
    })),
  };
}

function connectionKey(source: ManualPadEndpoint, target: ManualPadEndpoint) {
  return `${source.ownerId}:${source.pinId}->${target.ownerId}:${target.pinId}`;
}

function endpointKey(endpoint: ManualPadEndpoint) {
  return `${endpoint.ownerId}:${endpoint.pinId}`;
}

function buildUniquePortName(baseName: string, takenNames: Set<string>) {
  const normalizedBase = baseName.trim().toUpperCase() || 'PORT';
  if (!takenNames.has(normalizedBase)) {
    return normalizedBase;
  }

  let index = 2;
  while (takenNames.has(`${normalizedBase}_${index}`)) {
    index += 1;
  }

  return `${normalizedBase}_${index}`;
}

function buildSemanticPortLabel(candidate: SubCircuitPortCandidate) {
  switch (candidate.semanticGroup) {
    case 'power':
      return '전원';
    case 'ground':
      return '접지';
    case 'bus':
      return '버스';
    case 'analog':
      return '아날로그';
    case 'output':
      return '출력';
    case 'signal':
      return '신호';
    default:
      return '기타';
  }
}

function buildNextInternalPosition(components: PlacedComponent[]) {
  const nextIndex = components.length;
  return {
    x: Math.round((180 + (nextIndex % 3) * 210) / 15) * 15,
    y: Math.round((90 + Math.floor(nextIndex / 3) * 140) / 15) * 15,
  };
}

function buildUniqueInternalComponentName(template: ComponentTemplate, components: PlacedComponent[]) {
  const baseName = template.name;
  const count = components.filter(component => component.templateId === template.id).length + 1;
  return `${baseName} ${count}`;
}

function edgeToInternalConnection(
  connection: Connection,
  components: PlacedComponent[]
): ManualNetConnection | null {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
    return null;
  }

  if (!components.some(component => component.instanceId === connection.source)) {
    return null;
  }

  if (!components.some(component => component.instanceId === connection.target)) {
    return null;
  }

  return {
    id: `internal:${crypto.randomUUID()}`,
    source: {
      ownerType: 'component',
      ownerId: connection.source,
      pinId: connection.sourceHandle.replace(/__source$/, ''),
    },
    target: {
      ownerType: 'component',
      ownerId: connection.target,
      pinId: connection.targetHandle.replace(/__source$/, ''),
    },
  };
}

function InternalComponentNode({ data, selected }: NodeProps<EditorInternalNodeData>) {
  const requiredPins = data.template?.requiredPins ?? [];
  const { leftPins, rightPins } = getComponentPinLayout(requiredPins, data.template?.category);
  const compactName = formatCanvasComponentName(data.component.name, { maxLength: 12 });
  const contentRows = Math.max(leftPins.length, rightPins.length, 1);
  const bodyHeight = 32 + contentRows * 18;

  return (
    <div
      className="relative rounded-md border border-amber-400/80 bg-[#171717] font-mono shadow-lg"
      style={{
        width: 152,
        minHeight: bodyHeight,
        boxShadow: selected ? '0 0 0 1px rgba(250, 204, 21, 0.7), 0 0 18px rgba(250, 204, 21, 0.18)' : 'none',
      }}
    >
      <div className="flex items-center justify-between border-b border-amber-400/70 bg-[#242424] px-2 py-1">
        <span className="truncate text-[10px] font-bold text-amber-300">{compactName}</span>
        {data.component.value ? (
          <span className="truncate text-[9px] text-emerald-300">{data.component.value}</span>
        ) : null}
      </div>
      <div className="space-y-1 px-1.5 py-2">
        {Array.from({ length: contentRows }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-3 text-[9px] uppercase">
            <div className="relative min-h-4 flex-1">
              {leftPins[index] ? (
                <>
                  <Handle
                    type="source"
                    position={Position.Left}
                    id={`${leftPins[index].name}__source`}
                    style={{ left: -7, width: 10, height: 10, background: 'rgba(34,197,94,0.24)', border: '1px solid rgba(34,197,94,0.55)' }}
                  />
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={leftPins[index].name}
                    style={{ left: -7, width: 10, height: 10, background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.45)' }}
                  />
                  <span className="pl-2 text-slate-300">{leftPins[index].name}</span>
                </>
              ) : null}
            </div>
            <div className="relative min-h-4 flex-1 text-right">
              {rightPins[index] ? (
                <>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`${rightPins[index].name}__source`}
                    style={{ right: -7, width: 10, height: 10, background: 'rgba(34,197,94,0.24)', border: '1px solid rgba(34,197,94,0.55)' }}
                  />
                  <Handle
                    type="target"
                    position={Position.Right}
                    id={rightPins[index].name}
                    style={{ right: -7, width: 10, height: 10, background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.45)' }}
                  />
                  <span className="pr-2 text-slate-300">{rightPins[index].name}</span>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-800 bg-[#111827] px-2 py-1 text-center text-[8px] uppercase tracking-[0.16em] text-slate-500">
        {data.template?.category ?? 'component'}
      </div>
    </div>
  );
}

function ExternalPortNode({ data, selected }: NodeProps<EditorPortNodeData>) {
  return (
    <div
      className="relative w-[168px] rounded-md border border-cyan-500/70 bg-[#0f172a] px-3 py-2 font-mono"
      style={{
        boxShadow: selected ? '0 0 0 1px rgba(34, 211, 238, 0.65), 0 0 16px rgba(34, 211, 238, 0.14)' : 'none',
      }}
    >
      <Handle
        type="source"
        position={Position.Right}
        id="PORT__source"
        style={{ right: -7, width: 11, height: 11, background: 'rgba(34,197,94,0.24)', border: '1px solid rgba(34,197,94,0.55)' }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="PORT"
        style={{ right: -7, width: 11, height: 11, background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.45)' }}
      />
      <div className="text-[10px] font-semibold uppercase text-cyan-300">{data.externalPinId}</div>
      <div className="mt-1 text-[9px] text-slate-300">{data.sourceLabel}</div>
      <div className="mt-1 text-[8px] text-slate-500">{data.detail}</div>
    </div>
  );
}

const editorNodeTypes = {
  internalNode: InternalComponentNode,
  portNode: ExternalPortNode,
};

function buildEditorNodes(
  components: PlacedComponent[],
  portMappings: SubCircuitPortMapping[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
): Node[] {
  const portNodes: Node<EditorPortNodeData>[] = portMappings.map((port, index) => ({
    id: `port:${port.externalPinId}`,
    type: 'portNode',
    position: { x: -220, y: 40 + index * 114 },
    draggable: false,
    data: {
      externalPinId: port.externalPinId,
      sourceLabel: `${port.internalComponentName ?? port.internalEndpoint.ownerId}.${port.internalPinLabel ?? port.internalEndpoint.pinId}`,
      detail: '포트 노드를 다른 내부 핀에 다시 연결하면 매핑이 바뀝니다.',
    },
  }));

  const componentNodes: Node<EditorInternalNodeData>[] = components.map(component => ({
    id: component.instanceId,
    type: 'internalNode',
    position: component.position,
    data: {
      component,
      template: resolveTemplate(component.templateId),
    },
  }));

  return [...portNodes, ...componentNodes];
}

function buildEditorEdges(
  manualConnections: ManualNetConnection[],
  portMappings: SubCircuitPortMapping[]
): Edge[] {
  const internalEdges = manualConnections.map(connection => ({
    id: connection.id,
    source: connection.source.ownerId,
    target: connection.target.ownerId,
    sourceHandle: `${connection.source.pinId}__source`,
    targetHandle: connection.target.pinId,
    type: 'smoothstep',
    style: { stroke: '#22c55e', strokeWidth: 1.5 },
  }));

  const portEdges = portMappings.map(port => ({
    id: `port:${port.externalPinId}`,
    source: `port:${port.externalPinId}`,
    target: port.internalEndpoint.ownerId,
    sourceHandle: 'PORT__source',
    targetHandle: port.internalEndpoint.pinId,
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#38bdf8', strokeWidth: 1.6, strokeDasharray: '4 3' },
  }));

  return [...portEdges, ...internalEdges];
}

function EditorFlow({
  state,
  resolveTemplate,
  onChange,
}: {
  state: EditorState;
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined;
  onChange: (nextState: EditorState) => void;
}) {
  const nodes = useMemo(
    () => buildEditorNodes(state.components, state.portMappings, resolveTemplate),
    [resolveTemplate, state.components, state.portMappings]
  );
  const edges = useMemo(
    () => buildEditorEdges(state.manualConnections, state.portMappings),
    [state.manualConnections, state.portMappings]
  );
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  useEffect(() => {
    if (!rfInstance) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      rfInstance.fitView({ padding: 0.24, duration: 180 });
    });

    return () => cancelAnimationFrame(frame);
  }, [nodes, rfInstance]);

  const handleNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id.startsWith('port:')) {
      return;
    }

    onChange({
      ...state,
      components: state.components.map(component =>
        component.instanceId === node.id
          ? {
              ...component,
              position: {
                x: Math.round(node.position.x / 15) * 15,
                y: Math.round(node.position.y / 15) * 15,
              },
            }
          : component
      ),
    });
  }, [onChange, state]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
      return;
    }

    const portSource = connection.source.startsWith('port:') ? connection.source : null;
    const portTarget = connection.target.startsWith('port:') ? connection.target : null;

    if (portSource && portTarget) {
      toast.info('포트끼리는 직접 연결하지 않습니다.');
      return;
    }

    if (portSource || portTarget) {
      const portId = (portSource ?? portTarget)!.replace(/^port:/, '');
      const componentId = portSource ? connection.target : connection.source;
      const handleId = (portSource ? connection.targetHandle : connection.sourceHandle).replace(/__source$/, '');
      if (!state.components.some(component => component.instanceId === componentId)) {
        return;
      }

      onChange({
        ...state,
        portMappings: state.portMappings.map(port =>
          port.externalPinId === portId
            ? {
                ...port,
                internalEndpoint: {
                  ownerType: 'component',
                  ownerId: componentId,
                  pinId: handleId,
                },
                internalComponentName: state.components.find(component => component.instanceId === componentId)?.name,
                internalPinLabel: handleId,
              }
            : port
        ),
      });
      return;
    }

    const nextConnection = edgeToInternalConnection(connection, state.components);
    if (!nextConnection) {
      toast.error('내부 배선 연결에 실패했습니다.');
      return;
    }

    const nextKey = connectionKey(nextConnection.source, nextConnection.target);
    const reverseKey = connectionKey(nextConnection.target, nextConnection.source);
    if (state.manualConnections.some(item => {
      const currentKey = connectionKey(item.source, item.target);
      return currentKey === nextKey || currentKey === reverseKey;
    })) {
      toast.info('이미 같은 내부 연결이 있습니다.');
      return;
    }

    onChange({
      ...state,
      manualConnections: [...state.manualConnections, nextConnection],
    });
  }, [onChange, state]);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (edge.id.startsWith('port:')) {
      toast.info('포트 연결은 다른 내부 핀으로 다시 연결해서 바꿀 수 있습니다.');
      return;
    }

    onChange({
      ...state,
      manualConnections: state.manualConnections.filter(connection => connection.id !== edge.id),
    });
  }, [onChange, state]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={editorNodeTypes}
      onInit={setRfInstance}
      onConnect={handleConnect}
      onNodeDragStop={handleNodeDragStop}
      onEdgeClick={handleEdgeClick}
      fitView
      fitViewOptions={{ padding: 0.24 }}
      minZoom={0.2}
      maxZoom={2}
      snapToGrid
      snapGrid={[15, 15]}
      nodesConnectable
      nodesDraggable
      connectionRadius={42}
      connectionMode={ConnectionMode.Loose}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: 'smoothstep' }}
      className="bg-[#070b14]"
    >
      <Background variant={BackgroundVariant.Dots} gap={15} size={1.5} color="#334155" />
      <Controls showInteractive={false} className="!rounded-none !overflow-hidden" style={{ background: '#0d1117', border: '1px solid #334155', boxShadow: 'none' }} />
      <MiniMap
        style={{ background: '#0a0f1a', border: '1px solid #334155', borderRadius: 0 }}
        nodeColor={node => node.id.startsWith('port:') ? '#06b6d4' : '#f59e0b'}
        maskColor="rgba(0,0,0,0.7)"
      />
    </ReactFlow>
  );
}

export function SubCircuitEditorDialog({
  open,
  templateId,
  template,
  boardId,
  resolveTemplate,
  onClose,
  onSave,
}: {
  open: boolean;
  templateId: string | null;
  template: SubCircuitTemplate | null;
  boardId: string;
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined;
  onClose: () => void;
  onSave: (templateId: string, update: SubCircuitTemplateUpdate) => { success: boolean; error?: string };
}) {
  const [draft, setDraft] = useState<EditorState | null>(() => (template ? cloneEditorState(template) : null));
  const [librarySearch, setLibrarySearch] = useState('');

  const updateDraft = useCallback((nextDraftOrUpdater: EditorState | ((current: EditorState) => EditorState)) => {
    setDraft(current => {
      if (!current) {
        return current;
      }

      const nextDraft =
        typeof nextDraftOrUpdater === 'function'
          ? (nextDraftOrUpdater as (current: EditorState) => EditorState)(current)
          : nextDraftOrUpdater;

      const normalized = normalizeSubCircuitEditorState(nextDraft, boardId, resolveTemplate);
      return {
        ...nextDraft,
        manualConnections: normalized.manualConnections,
        portMappings: normalized.portMappings,
      };
    });
  }, [boardId, resolveTemplate]);

  const portSummary = useMemo(() => {
    if (!draft) {
      return [];
    }

    return draft.portMappings.map(port => ({
      externalPinId: port.externalPinId,
      targetLabel: `${draft.components.find(component => component.instanceId === port.internalEndpoint.ownerId)?.name ?? port.internalEndpoint.ownerId}.${port.internalEndpoint.pinId}`,
    }));
  }, [draft]);

  const portCandidates = useMemo(() => {
    if (!draft) {
      return [];
    }

    return normalizeSubCircuitEditorState(draft, boardId, resolveTemplate).portCandidates;
  }, [boardId, draft, resolveTemplate]);

  const filteredLibraryTemplates = useMemo(() => {
    const pool = COMPONENT_TEMPLATES.filter(template => !template.isSubCircuit);
    const preferred = pool.filter(template => FEATURED_INTERNAL_TEMPLATE_IDS.includes(template.id as typeof FEATURED_INTERNAL_TEMPLATE_IDS[number]));
    const rest = pool.filter(template => !FEATURED_INTERNAL_TEMPLATE_IDS.includes(template.id as typeof FEATURED_INTERNAL_TEMPLATE_IDS[number]));
    const ordered = [...preferred, ...rest];
    const query = librarySearch.trim().toLowerCase();
    if (!query) {
      return ordered.slice(0, 12);
    }

    return ordered.filter(template =>
      [template.name, template.description, template.id].some(value => value.toLowerCase().includes(query))
    ).slice(0, 12);
  }, [librarySearch]);

  const availablePortCandidates = useMemo(() => {
    if (!draft) {
      return [];
    }

    const usedEndpointKeys = new Set(draft.portMappings.map(port => endpointKey(port.internalEndpoint)));
    return portCandidates.filter(candidate =>
      !candidate.groupedInternalEndpoints.some(endpoint => usedEndpointKeys.has(endpointKey(endpoint)))
    );
  }, [draft, portCandidates]);

  const addPortCandidate = useCallback((candidate: SubCircuitPortCandidate) => {
    updateDraft(current => {
      if (!current) {
        return current;
      }

      const takenNames = new Set(current.portMappings.map(port => port.externalPinId.toUpperCase()));
      const componentName =
        current.components.find(component => component.instanceId === candidate.internalEndpoint.ownerId)?.name ??
        candidate.internalEndpoint.ownerId;

      return {
        ...current,
        portMappings: [
          ...current.portMappings,
          {
            externalPinId: buildUniquePortName(candidate.defaultPinName, takenNames),
            internalEndpoint: cloneEndpoint(candidate.internalEndpoint),
            internalComponentName: componentName,
            internalPinLabel: candidate.internalEndpoint.pinId,
          },
        ],
      };
    });
  }, [updateDraft]);

  const removePort = useCallback((externalPinId: string) => {
    updateDraft(current => {
      if (!current || current.portMappings.length <= 1) {
        return current;
      }

      return {
        ...current,
        portMappings: current.portMappings.filter(port => port.externalPinId !== externalPinId),
      };
    });
  }, [updateDraft]);

  const renamePort = useCallback((currentPinId: string, nextValue: string) => {
    updateDraft(current => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        portMappings: current.portMappings.map(port =>
          port.externalPinId === currentPinId
            ? {
                ...port,
                externalPinId: nextValue,
              }
            : port
        ),
      };
    });
  }, [updateDraft]);

  const addInternalComponent = useCallback((templateToAdd: ComponentTemplate) => {
    updateDraft(current => {
      if (!current) {
        return current;
      }

      const nextComponent: PlacedComponent = {
        instanceId: crypto.randomUUID(),
        templateId: templateToAdd.id,
        name: buildUniqueInternalComponentName(templateToAdd, current.components),
        value: templateToAdd.defaultValue,
        position: buildNextInternalPosition(current.components),
        rotation: 0,
        assignedPins: {},
        isFullyRouted: true,
      };

      return {
        ...current,
        components: [...current.components, nextComponent],
      };
    });
  }, [updateDraft]);

  const removeInternalComponent = useCallback((instanceId: string) => {
    updateDraft(current => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        components: current.components.filter(component => component.instanceId !== instanceId),
        manualConnections: current.manualConnections.filter(connection =>
          connection.source.ownerId !== instanceId && connection.target.ownerId !== instanceId
        ),
        portMappings: current.portMappings.filter(port => port.internalEndpoint.ownerId !== instanceId),
      };
    });
  }, [updateDraft]);

  if (!open || !template || !templateId || !draft) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[3300] flex items-center justify-center bg-black/60 px-6 py-8 backdrop-blur-sm">
      <div className="flex h-[88vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1220] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-300">
              <Boxes size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-100">서브서킷 내부 편집</div>
              <div className="text-xs text-slate-400">
                더블클릭으로 들어온 블록 내부 회로입니다. 내부 배선과 포트 구성까지 여기서 바로 손볼 수 있습니다.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => {
                const result = onSave(templateId, {
                  internalState: {
                    components: draft.components,
                    manualConnections: draft.manualConnections,
                  },
                  portMappings: draft.portMappings,
                });

                if (!result.success) {
                  toast.error('서브서킷 저장 실패', {
                    description: result.error ?? '내부 회로 저장 중 문제가 발생했습니다.',
                  });
                  return;
                }

                toast.success('서브서킷 저장 완료', {
                  description: '같은 템플릿을 쓰는 바깥 인스턴스에 변경 사항이 바로 반영됩니다.',
                });
                onClose();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-black transition hover:bg-cyan-400"
            >
              <Save size={14} />
              저장
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px]">
          <div className="min-h-0 border-r border-slate-800">
            <ReactFlowProvider>
              <EditorFlow
                state={draft}
                resolveTemplate={resolveTemplate}
                onChange={updateDraft}
              />
            </ReactFlowProvider>
          </div>
          <div className="min-h-0 overflow-y-auto bg-[#0a1220] p-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                작업 안내
              </div>
              <ul className="mt-3 space-y-2 text-xs text-slate-300">
                <li>포트 노드에서 내부 핀으로 다시 연결하면 포트 매핑이 바뀝니다.</li>
                <li>오른쪽 목록에서 포트를 새로 추가하거나 제거해 외부 인터페이스를 다시 설계할 수 있습니다.</li>
                <li>내부 부품끼리 선을 다시 이어서 회로 흐름을 수정할 수 있습니다.</li>
                <li>내부 선을 클릭하면 그 연결만 바로 지울 수 있습니다.</li>
              </ul>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Plus size={14} className="text-violet-300" />
                내부 부품 추가
              </div>
              <div className="mt-2 text-xs text-slate-400">
                서브캔버스 안에서 부품을 바로 더하고, 포트 후보는 현재 내부 넷 구조 기준으로 자동 다시 계산됩니다.
              </div>
              <div className="mt-3 rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2">
                <div className="flex items-center gap-2 text-slate-400">
                  <Search size={13} />
                  <input
                    type="text"
                    value={librarySearch}
                    onChange={event => setLibrarySearch(event.target.value)}
                    placeholder="저항, LED, sensor..."
                    className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {filteredLibraryTemplates.map(templateOption => (
                  <button
                    key={templateOption.id}
                    type="button"
                    onClick={() => addInternalComponent(templateOption)}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#101827] px-3 py-2 text-left transition hover:border-violet-400/40 hover:bg-violet-500/5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-100">{templateOption.name}</div>
                      <div className="truncate text-[11px] text-slate-400">{templateOption.description}</div>
                    </div>
                    <span className="ml-3 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200">
                      추가
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Cable size={14} className="text-cyan-300" />
                현재 외부 포트
              </div>
              <div className="mt-3 space-y-3">
                {portSummary.map(port => (
                  <div key={port.externalPinId} className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-300">
                          외부 포트 이름
                        </div>
                        <input
                          type="text"
                          value={draft.portMappings.find(item => item.externalPinId === port.externalPinId)?.externalPinId ?? port.externalPinId}
                          onChange={event => renamePort(port.externalPinId, event.target.value)}
                          className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removePort(port.externalPinId)}
                        disabled={draft.portMappings.length <= 1}
                        className="mt-5 inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-[11px] font-medium text-rose-200 transition hover:border-rose-400/50 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Trash2 size={12} />
                        제거
                      </button>
                    </div>
                    <div className="mt-3 text-xs text-slate-200">{port.targetLabel}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Plus size={14} className="text-emerald-300" />
                추가 가능한 포트 후보
              </div>
              <div className="mt-1 text-xs text-slate-400">
                바깥 연결 여부만 보지 않고, 내부 전체 넷 구조를 기준으로 새 포트 후보를 넓게 제안합니다.
              </div>
              <div className="mt-3 space-y-3">
                {availablePortCandidates.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-3 text-xs text-slate-500">
                    지금은 더 꺼낼 만한 새 포트 후보가 없습니다.
                  </div>
                ) : availablePortCandidates.map(candidate => (
                  <div key={candidate.key} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-semibold text-emerald-200">{candidate.sourceLabel}</div>
                          <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-100">
                            {buildSemanticPortLabel(candidate)}
                          </span>
                        </div>
                        {candidate.groupedSourceLabels.length > 1 ? (
                          <div className="mt-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-2.5 py-2 text-[11px] text-emerald-100">
                            같은 내부 넷으로 묶인 핀: {candidate.groupedSourceLabels.join(', ')}
                          </div>
                        ) : null}
                        <div className="mt-2 text-[11px] text-slate-400">
                          {candidate.groupedExternalLabels.length > 0
                            ? `기존 바깥 연결 힌트: ${candidate.groupedExternalLabels.join(', ')}`
                            : '아직 바깥으로 꺼내지지 않은 내부 넷입니다.'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => addPortCandidate(candidate)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] font-medium text-emerald-200 transition hover:border-emerald-400/50 hover:bg-emerald-500/15"
                      >
                        <Plus size={12} />
                        추가
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Boxes size={14} className="text-amber-300" />
                내부 부품
              </div>
              <div className="mt-3 space-y-2">
                {draft.components.map(component => (
                  <div key={component.instanceId} className="rounded-lg border border-slate-800 bg-[#101827] px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-100">{component.name}</div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          위치 {component.position.x}, {component.position.y}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeInternalComponent(component.instanceId)}
                        className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-200 transition hover:border-rose-400/45 hover:bg-rose-500/15"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
