import { getBoardById } from '@/constants/boards';
import {
  collectCppReviewArtifacts,
  collectCppReviewArtifactsAsync,
  collectPythonReviewArtifactsAsync,
  collectPythonReviewArtifacts,
  collectPythonOperations,
  getLineNumber,
  looksLikeCppCode,
  type CppParseTree,
} from '@/lib/ast-parser';
import { getTemplateBusProfile } from '@/lib/datasheet-rules';
import { createFormalIssue } from '@/lib/engine-i18n';
import { buildIssueDedupKey } from '@/lib/issue-utils';
import { LIBRARY_API_SIGNATURES } from '@/lib/prompt-builder';
import type {
  BoardPinDriveState,
  ComponentTemplate,
  FormalVerificationIssue,
  FormalVerificationReport,
  PlacedComponent,
  ReviewEngineMeta,
} from '@/types';
import type { CircuitAnalysisReport } from '@/lib/circuit-netlist';

type CodeScope = 'setup' | 'loop' | 'other';

type ConnectedPinContext = {
  componentName: string;
  componentPin: string;
  templateId: string;
};

type ParsedLibraryApiCall = {
  include: string;
  subject: string;
  kind: 'method' | 'constructor' | 'forbidden-method';
  symbol: string;
  argCount: number;
  line: number;
  note?: string;
};

function resolveReviewEngineMeta(params: {
  code: string;
  cppArtifacts: ReturnType<typeof collectCppReviewArtifacts> | null;
  pythonArtifacts: ReturnType<typeof collectPythonReviewArtifacts> | null;
}): ReviewEngineMeta {
  const { code, cppArtifacts, pythonArtifacts } = params;
  const cppBackend = cppArtifacts?.parseTree?.backend;
  const pythonBackend = pythonArtifacts?.parseTree?.backend;

  if (cppArtifacts) {
    return {
      language: 'cpp',
      parserBackend: cppBackend ?? 'fallback',
      parserTier:
        cppBackend === 'rust-wasm' ? 'structured-review' : 'pattern-fallback',
    };
  }

  if (pythonArtifacts) {
    return {
      language: 'python',
      parserBackend: pythonBackend ?? 'fallback',
      parserTier:
        pythonBackend === 'tree-sitter'
          ? 'tree-sitter-ast'
          : pythonBackend === 'generated' || pythonBackend === 'rust-wasm'
            ? 'structured-review'
            : 'pattern-fallback',
    };
  }

  return {
    language: looksLikeCppCode(code) ? 'cpp' : 'python',
    parserBackend: 'fallback',
    parserTier: 'pattern-fallback',
  };
}

const STRONG_COMPONENT_OUTPUT_PINS = new Set([
  'AOUT',
  'DOUT',
  'ECHO',
  'MISO',
  'TX',
]);

const BIDIRECTIONAL_BUS_PINS = new Set(['SDA', 'SCL', 'DATA', 'MOSI', 'RX', 'SIGNAL']);
const INTERRUPT_CAPABLE_PINS: Partial<Record<string, string[]>> = {
  uno: ['D2', 'D3'],
  nano: ['D2', 'D3'],
};

function parseArgumentCount(rawArgs: string) {
  const trimmed = rawArgs.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(',').map(value => value.trim()).filter(Boolean).length;
}

function hasAdjacentResistorOnBoardPin(circuitAnalysis: CircuitAnalysisReport, boardPin: string) {
  const net = circuitAnalysis.nets.find(item =>
    item.nodes.some(node => node.ownerType === 'board' && node.pinId === boardPin)
  );

  if (!net) {
    return false;
  }

  return circuitAnalysis.resistors.some(
    resistor => resistor.netA === net.id || resistor.netB === net.id
  );
}

type ButtonSignalPolarity = 'grounded' | 'powered' | 'ambiguous' | 'floating';

function inferButtonSignalPolarity(component: PlacedComponent): ButtonSignalPolarity {
  const tiedToGround = Boolean(component.assignedPins.GND);
  const tiedToPower = Boolean(component.assignedPins.VCC);

  if (tiedToGround && tiedToPower) {
    return 'ambiguous';
  }
  if (tiedToGround) {
    return 'grounded';
  }
  if (tiedToPower) {
    return 'powered';
  }
  return 'floating';
}

function stripSourceCommentsForLibraryScan(code: string) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n\r]/g, ' '))
    .replace(/\/\/[^\n\r]*/g, match => match.replace(/[^\n\r]/g, ' '));
}

function collectLibraryApiCalls(code: string, includedHeaders: Set<string>, parseTree: CppParseTree | null) {
  const sanitizedCode = stripSourceCommentsForLibraryScan(code);
  const calls: ParsedLibraryApiCall[] = [];
  const capturedCalls = parseTree?.calls ?? [];

  for (const spec of LIBRARY_API_SIGNATURES) {
    if (!includedHeaders.has(spec.include)) {
      continue;
    }

    const knownSubjects = new Set<string>();

    for (const constructor of spec.constructors ?? []) {
      const regex = new RegExp(`\\b${constructor.symbol}\\s+([A-Za-z_]\\w*)\\s*\\(([^)]*)\\)`, 'g');
      for (const match of sanitizedCode.matchAll(regex)) {
        if (match.index == null) {
          continue;
        }

        if (match[1]) {
          knownSubjects.add(match[1]);
        }

        calls.push({
          include: spec.include,
          subject: match[1] ?? constructor.symbol,
          kind: 'constructor',
          symbol: constructor.symbol,
          argCount: parseArgumentCount(match[2] ?? ''),
          line: getLineNumber(sanitizedCode, match.index),
        });
      }
    }

    for (const method of spec.methods ?? []) {
      const matchingCalls = capturedCalls.filter(call => call.name === method.name && call.subject);
      if (matchingCalls.length > 0) {
        for (const call of matchingCalls) {
          const subject = call.subject ?? '';
          if (knownSubjects.size > 0 && !knownSubjects.has(subject)) {
            continue;
          }

          calls.push({
            include: spec.include,
            subject,
            kind: 'method',
            symbol: method.name,
            argCount: call.arguments.length,
            line: call.line,
          });
        }
        continue;
      }

      const regex = new RegExp(`\\b([A-Za-z_]\\w*)\\.${method.name}\\s*\\(([^)]*)\\)`, 'g');
      for (const match of sanitizedCode.matchAll(regex)) {
        if (match.index == null) {
          continue;
        }

        const subject = match[1] ?? '';
        if (knownSubjects.size > 0 && !knownSubjects.has(subject)) {
          continue;
        }

        calls.push({
          include: spec.include,
          subject,
          kind: 'method',
          symbol: method.name,
          argCount: parseArgumentCount(match[2] ?? ''),
          line: getLineNumber(sanitizedCode, match.index),
        });
      }
    }

    for (const forbidden of spec.forbiddenMethods ?? []) {
      const matchingCalls = capturedCalls.filter(call => call.name === forbidden.name && call.subject);
      if (matchingCalls.length > 0) {
        for (const call of matchingCalls) {
          const subject = call.subject ?? '';
          if (knownSubjects.size > 0 && !knownSubjects.has(subject)) {
            continue;
          }

          calls.push({
            include: spec.include,
            subject,
            kind: 'forbidden-method',
            symbol: forbidden.name,
            argCount: call.arguments.length,
            line: call.line,
            note: forbidden.message,
          });
        }
        continue;
      }

      const regex = new RegExp(`\\b([A-Za-z_]\\w*)\\.${forbidden.name}\\s*\\(([^)]*)\\)`, 'g');
      for (const match of sanitizedCode.matchAll(regex)) {
        if (match.index == null) {
          continue;
        }

        const subject = match[1] ?? '';
        if (knownSubjects.size > 0 && !knownSubjects.has(subject)) {
          continue;
        }

        calls.push({
          include: spec.include,
          subject,
          kind: 'forbidden-method',
          symbol: forbidden.name,
          argCount: parseArgumentCount(match[2] ?? ''),
          line: getLineNumber(sanitizedCode, match.index),
          note: forbidden.message,
        });
      }
    }
  }

  return calls;
}

function buildBoardPinConnectionMap(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const map = new Map<string, ConnectedPinContext[]>();

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    for (const [componentPin, boardPin] of Object.entries(component.assignedPins)) {
      const current = map.get(boardPin) ?? [];
      current.push({
        componentName: component.name,
        componentPin,
        templateId: template.id,
      });
      map.set(boardPin, current);
    }
  }

  return map;
}

function buildNetMap(circuitAnalysis: CircuitAnalysisReport) {
  const map = new Map<string, CircuitAnalysisReport['nets'][number]>();

  for (const net of circuitAnalysis.nets) {
    for (const node of net.nodes) {
      if (node.ownerType === 'board') {
        map.set(node.pinId, net);
      }
    }
  }

  return map;
}

function pushIssue(list: FormalVerificationIssue[], issue: FormalVerificationIssue) {
  const issueKey = buildIssueDedupKey(issue);
  const duplicate = list.some(item => buildIssueDedupKey(item) === issueKey);

  if (!duplicate) {
    list.push(issue);
  }
}

function verifyCircuitCodeConsistencyInternal(
  params: {
  boardId: string;
  code?: string;
  components: PlacedComponent[];
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined;
  circuitAnalysis: CircuitAnalysisReport;
},
  cppArtifactsOverride?: ReturnType<typeof collectCppReviewArtifacts> | null,
  pythonArtifactsOverride?: ReturnType<typeof collectPythonReviewArtifacts> | null
): FormalVerificationReport {
  const { boardId, code, components, resolveTemplate, circuitAnalysis } = params;

  if (!code || code.trim().length === 0) {
    return {
      analyzed: false,
      operationCount: 0,
      issueCount: 0,
      issues: [],
      engineMeta: {
        language: 'unknown',
        parserBackend: 'none',
        parserTier: 'none',
      },
    };
  }

  const useCppPath = cppArtifactsOverride ? true : looksLikeCppCode(code);
  const cppArtifacts = cppArtifactsOverride ?? (useCppPath ? collectCppReviewArtifacts(code, boardId) : null);
  const pythonArtifacts = pythonArtifactsOverride ?? (cppArtifacts ? null : collectPythonReviewArtifacts(code, boardId));
  const operations = cppArtifacts?.operations ?? pythonArtifacts?.operations ?? collectPythonOperations(code, boardId);
  const engineMeta = resolveReviewEngineMeta({ code, cppArtifacts, pythonArtifacts });
  const issues: FormalVerificationIssue[] = [];
  const board = getBoardById(boardId);
  const boardConnections = buildBoardPinConnectionMap(components, resolveTemplate);
  const netByBoardPin = buildNetMap(circuitAnalysis);
  const i2cAddressUses = cppArtifacts?.i2cAddressUses ?? [];
  const interruptUses = cppArtifacts?.interruptUses ?? [];
  const includedHeaders = new Set(cppArtifacts?.includedHeaders ?? []);
  const libraryApiCalls = collectLibraryApiCalls(code, includedHeaders, cppArtifacts?.parseTree ?? null);
  const latestPinModeByPin = new Map<string, { mode: string; scope: CodeScope; line: number }>();
  const boardPinDriveStates = new Map<string, BoardPinDriveState>();

  for (const operation of [...operations].sort((a, b) => a.line - b.line)) {
    const pinDefinition = board.pinDefinitions.find(pin => pin.id === operation.boardPin);
    const net = netByBoardPin.get(operation.boardPin);
    const connections = boardConnections.get(operation.boardPin) ?? [];
    const connectedPinNames = connections.map(item => item.componentPin.toUpperCase());

    if (!pinDefinition) {
      continue;
    }

    if (operation.type === 'analogRead' && !pinDefinition.type.includes('ANALOG')) {
      pushIssue(issues, createFormalIssue({
        severity: 'error',
        code: 'formal.analog-read-on-non-adc',
        params: {
          boardPin: operation.boardPin,
        },
        boardPin: operation.boardPin,
        operation: operation.type,
        line: operation.line,
        ruleId: 'formal.analog-read-on-non-adc',
      }));
    }

    if (operation.type === 'pinMode') {
      const normalizedMode = operation.mode.toUpperCase();
      latestPinModeByPin.set(operation.boardPin, {
        mode: normalizedMode,
        scope: operation.scope,
        line: operation.line,
      });
      boardPinDriveStates.set(operation.boardPin, {
        boardPin: operation.boardPin,
        mode:
          normalizedMode === 'INPUT_PULLUP'
            ? 'input_pullup'
            : normalizedMode === 'INPUT'
              ? 'input'
              : normalizedMode.includes('OUTPUT')
                ? 'unknown'
                : 'unknown',
        sourceOperation: 'pinMode',
        line: operation.line,
      });
    } else if (operation.type === 'digitalWrite' || operation.type === 'analogWrite') {
      const knownMode = latestPinModeByPin.get(operation.boardPin);
      const isInputConflict =
        knownMode &&
        (
          knownMode.mode === 'INPUT' ||
          (operation.type === 'analogWrite' && knownMode.mode.startsWith('INPUT'))
        );

      if (isInputConflict) {
        pushIssue(issues, createFormalIssue({
          severity: 'error',
          code: 'formal.pin-mode-state-conflict',
          params: {
            boardPin: operation.boardPin,
            knownMode: knownMode?.mode ?? 'INPUT',
            operationType: operation.type,
          },
          boardPin: operation.boardPin,
          operation: operation.type,
          line: operation.line,
          ruleId: 'formal.pin-mode-state-conflict',
        }));
      }

      if (operation.type === 'analogWrite') {
        const pwmValue = operation.value ? Number.parseFloat(operation.value) : Number.NaN;
        const normalizedPwm = Number.isFinite(pwmValue) ? Math.max(0, Math.min(255, pwmValue)) : Number.NaN;
        const pwmDutyCycle = Number.isFinite(normalizedPwm) ? normalizedPwm / 255 : null;
        boardPinDriveStates.set(operation.boardPin, {
          boardPin: operation.boardPin,
          mode:
            normalizedPwm === 0
              ? 'output_low'
              : normalizedPwm === 255
                ? 'output_high'
                : 'output_pwm',
          sourceOperation: 'analogWrite',
          line: operation.line,
          pwmDutyCycle,
        });
      } else {
        const normalizedValue = operation.value?.toUpperCase();
        let nextMode: BoardPinDriveState['mode'] = 'unknown';

        if (knownMode?.mode === 'INPUT' && normalizedValue === 'HIGH') {
          nextMode = 'input_pullup';
        } else if (knownMode?.mode === 'INPUT' && normalizedValue === 'LOW') {
          nextMode = 'input';
        } else if (knownMode?.mode?.includes('OUTPUT')) {
          nextMode = normalizedValue === 'LOW' ? 'output_low' : 'output_high';
        }

        boardPinDriveStates.set(operation.boardPin, {
          boardPin: operation.boardPin,
          mode: nextMode,
          sourceOperation: 'digitalWrite',
          line: operation.line,
        });
      }
    }

    if ((operation.type === 'digitalWrite' || operation.type === 'analogWrite') && net) {
      const groundedNet = net.nodes.some(node => node.ownerType === 'board' && node.pinId === 'GND');
      if (groundedNet && operation.value !== 'LOW') {
        pushIssue(issues, createFormalIssue({
          severity: 'error',
          code: 'formal.output-drive-grounded-net',
          params: {
            boardPin: operation.boardPin,
            operationType: operation.type,
            value: operation.value ?? 'HIGH',
          },
          boardPin: operation.boardPin,
          operation: operation.type,
          line: operation.line,
          ruleId: 'formal.output-drive-grounded-net',
        }));
      }
    }

    if ((operation.type === 'digitalWrite' || operation.type === 'analogWrite' || operation.type === 'pinMode') && connections.length === 0) {
      pushIssue(issues, createFormalIssue({
        severity: 'info',
        code: 'formal.unwired-pin-reference',
        params: {
          boardPin: operation.boardPin,
        },
        boardPin: operation.boardPin,
        operation: operation.type,
        line: operation.line,
        ruleId: 'formal.unwired-pin-reference',
      }));
    }

    const drivesOutputPath =
      operation.type === 'digitalWrite' ||
      operation.type === 'analogWrite' ||
      (operation.type === 'pinMode' && /OUTPUT/i.test(operation.mode));

    if (drivesOutputPath && connectedPinNames.some(pinName => STRONG_COMPONENT_OUTPUT_PINS.has(pinName))) {
      const conflictingPins = connections
        .filter(item => STRONG_COMPONENT_OUTPUT_PINS.has(item.componentPin.toUpperCase()))
        .map(item => `${item.componentName}:${item.componentPin}`);

      pushIssue(issues, createFormalIssue({
        severity: 'error',
        code: 'formal.output-collision-sensor-line',
        params: {
          boardPin: operation.boardPin,
          conflictingPins,
        },
        boardPin: operation.boardPin,
        operation: operation.type,
        line: operation.line,
        ruleId: 'formal.output-collision-sensor-line',
      }));
    }

    if (drivesOutputPath && connectedPinNames.some(pinName => BIDIRECTIONAL_BUS_PINS.has(pinName))) {
      const busPins = connections
        .filter(item => BIDIRECTIONAL_BUS_PINS.has(item.componentPin.toUpperCase()))
        .map(item => `${item.componentName}:${item.componentPin}`);

      pushIssue(issues, createFormalIssue({
        severity: 'warning',
        code: 'formal.bus-drive-review',
        params: {
          boardPin: operation.boardPin,
          busPins,
        },
        boardPin: operation.boardPin,
        operation: operation.type,
        line: operation.line,
        ruleId: 'formal.bus-drive-review',
      }));
    }
  }

  const i2cDevices = components
    .map(component => ({
      component,
      profile: getTemplateBusProfile(component.templateId),
    }))
    .filter(item => item.profile?.protocol === 'I2C' && item.profile.addresses && item.profile.addresses.length > 0);

  if (i2cDevices.length > 0) {
    for (const addressUse of i2cAddressUses) {
      const matchingDevices = addressUse.templateHint
        ? i2cDevices.filter(item => item.component.templateId === addressUse.templateHint)
        : i2cDevices;
      const candidateDevices = matchingDevices.length > 0 ? matchingDevices : i2cDevices;

      let hasValidAddressMatch = false;
      let detailedMismatchIssue: FormalVerificationIssue | null = null;

      for (const device of candidateDevices) {
        const addresses = device.profile?.addresses ?? [];
        if (addresses.includes(addressUse.address)) {
          // If the address is one of the possible addresses, check if the hardware wiring forces a specific one
          const addrPin = Object.keys(device.component.assignedPins).find(pin =>
            /^(ad0|addr|sdo|add|sa0|a0|a1|a2)$/i.test(pin)
          );

          if (addrPin && addresses.length >= 2) {
            const boardPin = device.component.assignedPins[addrPin];
            const net = netByBoardPin.get(boardPin);
            
            // Check if the pin is tied to GND or VCC
            const isGnd = boardPin === 'GND' || (net && net.nodes.some(n => n.ownerType === 'board' && n.pinId === 'GND'));
            const isVcc = ['5V', '3.3V', 'VCC'].includes(boardPin) || (net && net.nodes.some(n => n.ownerType === 'board' && ['5V', '3.3V', 'VCC'].includes(n.pinId)));

            const expectedAddress = isGnd ? addresses[0] : isVcc ? addresses[1] : null;

            if (expectedAddress && expectedAddress !== addressUse.address) {
              detailedMismatchIssue = createFormalIssue({
                severity: 'error',
                code: 'formal.i2c-address-mismatch',
                params: {
                  source: addressUse.source,
                  address: addressUse.address,
                  deviceNames: [device.component.name],
                  candidateAddresses: [expectedAddress],
                },
                operation: 'i2c-address',
                line: addressUse.line,
                recommendation: `회로도에서 ${device.component.name}의 ${addrPin} 핀이 ${isGnd ? '그라운드(GND)' : '전원(VCC)'}에 연결되어 있으므로 실제 하드웨어 주소는 ${expectedAddress}입니다. 코드의 주소 선언을 수정해 주세요.`,
                ruleId: 'formal.i2c-address-mismatch',
              });
              continue; // Check other devices if any
            }
          }
          hasValidAddressMatch = true;
          break;
        }
      }

      if (!hasValidAddressMatch) {
        if (detailedMismatchIssue) {
          pushIssue(issues, detailedMismatchIssue);
        } else {
          const names = candidateDevices.map(item => item.component.name);
          const addresses = Array.from(
            new Set(candidateDevices.flatMap(item => item.profile?.addresses ?? []))
          );

          pushIssue(issues, createFormalIssue({
            severity: 'error',
            code: 'formal.i2c-address-mismatch',
            params: {
              source: addressUse.source,
              address: addressUse.address,
              deviceNames: names,
              candidateAddresses: addresses,
            },
            operation: 'i2c-address',
            line: addressUse.line,
            ruleId: 'formal.i2c-address-mismatch',
          }));
        }
      }
    }
  }

  if ((boardId === 'uno' || boardId === 'nano') && includedHeaders.has('Servo.h')) {
    for (const operation of operations) {
      if (operation.type !== 'analogWrite') {
        continue;
      }

      if (operation.boardPin === 'D9' || operation.boardPin === 'D10') {
        pushIssue(issues, createFormalIssue({
          severity: 'warning',
          code: 'formal.timer-servo-pwm-conflict',
          params: {
            boardPin: operation.boardPin,
            boardName: board.name,
          },
          boardPin: operation.boardPin,
          operation: operation.type,
          line: operation.line,
          ruleId: 'formal.timer-servo-pwm-conflict',
        }));
      }
    }
  }

  const interruptPins = INTERRUPT_CAPABLE_PINS[boardId];
  if (interruptPins && interruptPins.length > 0) {
    for (const interruptUse of interruptUses) {
      if (!interruptPins.includes(interruptUse.boardPin)) {
        pushIssue(issues, createFormalIssue({
          severity: 'error',
          code: 'formal.interrupt-pin-unsupported',
          params: {
            boardPin: interruptUse.boardPin,
            boardName: board.name,
            interruptPins,
          },
          boardPin: interruptUse.boardPin,
          operation: 'attachInterrupt',
          line: interruptUse.line,
          ruleId: 'formal.interrupt-pin-unsupported',
        }));
      } else {
        const connections = boardConnections.get(interruptUse.boardPin) ?? [];
        if (connections.length === 0) {
          pushIssue(issues, createFormalIssue({
            severity: 'warning',
            code: 'formal.interrupt-pin-unwired',
            params: {
              boardPin: interruptUse.boardPin,
            },
            boardPin: interruptUse.boardPin,
            operation: 'attachInterrupt',
            line: interruptUse.line,
            recommendation: `코드에서 ${interruptUse.boardPin}번 핀을 인터럽트용으로 사용하고 있으나, 실제 회로도에 아무런 부품도 연결되어 있지 않습니다.`,
            ruleId: 'formal.interrupt-pin-unwired',
          }));
        } else {
          const hasOutputSource = connections.some(c =>
            /signal|out|int|irq|echo|tx/i.test(c.componentPin)
          );
          if (!hasOutputSource) {
            pushIssue(issues, createFormalIssue({
              severity: 'error',
              code: 'formal.interrupt-pin-no-output',
              params: {
                boardPin: interruptUse.boardPin,
              },
              boardPin: interruptUse.boardPin,
              operation: 'attachInterrupt',
              line: interruptUse.line,
              recommendation: `인터럽트 핀 ${interruptUse.boardPin}에 연결된 부품들 중 신호 출력을 주는 핀(INT, OUT 등)이 없습니다. 결선을 다시 확인해 주세요.`,
              ruleId: 'formal.interrupt-pin-no-output',
            }));
          }
        }
      }
    }
  }

  for (const component of components) {
    if (component.templateId !== 'tpl_button') {
      continue;
    }

    const signalPin = component.assignedPins.Signal;
    if (!signalPin) {
      continue;
    }

    const pinMode = latestPinModeByPin.get(signalPin);
    const isPlainInput = pinMode?.mode === 'INPUT';
    const usesInputPullup = pinMode?.mode === 'INPUT_PULLUP';
    const hasSignalResistor = hasAdjacentResistorOnBoardPin(circuitAnalysis, signalPin);
    const polarity = inferButtonSignalPolarity(component);

    if (polarity === 'grounded' && (isPlainInput || !pinMode) && !hasSignalResistor) {
      pushIssue(issues, createFormalIssue({
        severity: 'warning',
        code: 'formal.button-grounded-needs-input-pullup',
        params: {
          componentName: component.name,
          boardPin: signalPin,
        },
        componentName: component.name,
        boardPin: signalPin,
        operation: 'pinMode',
        line: pinMode?.line,
        ruleId: 'formal.button-grounded-needs-input-pullup',
      }));
      continue;
    }

    if (polarity === 'powered' && usesInputPullup) {
      pushIssue(issues, createFormalIssue({
        severity: 'error',
        code: 'formal.button-vcc-incompatible-pullup',
        params: {
          componentName: component.name,
          boardPin: signalPin,
        },
        componentName: component.name,
        boardPin: signalPin,
        operation: 'pinMode',
        line: pinMode.line,
        ruleId: 'formal.button-vcc-incompatible-pullup',
      }));
      continue;
    }

    if (polarity === 'powered' && (isPlainInput || !pinMode) && !hasSignalResistor) {
      pushIssue(issues, createFormalIssue({
        severity: 'warning',
        code: 'formal.button-vcc-needs-pulldown',
        params: {
          componentName: component.name,
          boardPin: signalPin,
        },
        componentName: component.name,
        boardPin: signalPin,
        operation: 'pinMode',
        line: pinMode?.line,
        ruleId: 'formal.button-vcc-needs-pulldown',
      }));
      continue;
    }

    if ((polarity === 'ambiguous' || polarity === 'floating') && (isPlainInput || !pinMode) && !hasSignalResistor) {
      pushIssue(issues, createFormalIssue({
        severity: 'warning',
        code: 'formal.floating-input-risk',
        params: {
          boardPin: signalPin,
        },
        componentName: component.name,
        boardPin: signalPin,
        operation: 'pinMode',
        line: pinMode?.line,
        ruleId: 'formal.floating-input-risk',
      }));
    }
  }

  for (const call of libraryApiCalls) {
    const spec = LIBRARY_API_SIGNATURES.find(item => item.include === call.include);
    if (!spec) {
      continue;
    }

    if (call.kind === 'forbidden-method') {
      pushIssue(issues, createFormalIssue({
        severity: 'error',
        code: 'formal.library-api-forbidden-call',
        params: {
          include: call.include,
          subject: call.subject,
          symbol: call.symbol,
        },
        operation: call.symbol,
        line: call.line,
        recommendation: call.note ?? '라이브러리 헤더의 공식 예제 메서드명을 다시 확인하세요.',
        ruleId: 'formal.library-api-forbidden-call',
      }));
      continue;
    }

    const allowedArgCounts =
      call.kind === 'constructor'
        ? spec.constructors?.find(item => item.symbol === call.symbol)?.allowedArgCounts
        : spec.methods?.find(item => item.name === call.symbol)?.allowedArgCounts;

    if (allowedArgCounts && !allowedArgCounts.includes(call.argCount)) {
      pushIssue(issues, createFormalIssue({
        severity: 'error',
        code: 'formal.library-api-arity-mismatch',
        params: {
          callLabel: `${call.include}:${call.kind === 'constructor' ? call.symbol : `${call.subject}.${call.symbol}`}`,
          argCount: call.argCount,
          allowedArgCounts,
        },
        operation: call.symbol,
        line: call.line,
        ruleId: 'formal.library-api-arity-mismatch',
      }));
    }
  }

  return {
    analyzed: true,
    operationCount: operations.length,
    issueCount: issues.length,
    issues,
    engineMeta,
    boardPinDriveStates: Array.from(boardPinDriveStates.values()),
  };
}

export function verifyCircuitCodeConsistency(params: {
  boardId: string;
  code?: string;
  components: PlacedComponent[];
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined;
  circuitAnalysis: CircuitAnalysisReport;
}): FormalVerificationReport {
  return verifyCircuitCodeConsistencyInternal(params);
}

export async function verifyCircuitCodeConsistencyAsync(params: {
  boardId: string;
  code?: string;
  components: PlacedComponent[];
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined;
  circuitAnalysis: CircuitAnalysisReport;
}): Promise<FormalVerificationReport> {
  const { code } = params;

  if (!code || code.trim().length === 0) {
    return verifyCircuitCodeConsistencyInternal(params);
  }

  if (looksLikeCppCode(code)) {
    const cppArtifacts = await collectCppReviewArtifactsAsync(code, params.boardId);
    if (!cppArtifacts.parseTree) {
      return {
        analyzed: false,
        operationCount: 0,
        issueCount: 1,
        issues: [
          {
            ...createFormalIssue({
              severity: 'error',
              code: 'formal.syntax-error',
              params: {
                languageLabel: 'C/C++',
              },
              ruleId: 'formal.syntax-error',
            }),
          },
        ],
        engineMeta: {
          language: 'cpp',
          parserBackend: 'fallback',
          parserTier: 'pattern-fallback',
        },
      };
    }

    return verifyCircuitCodeConsistencyInternal(params, cppArtifacts);
  }

  const pythonArtifacts = await collectPythonReviewArtifactsAsync(code, params.boardId);
  if (pythonArtifacts.parseTree.hasErrors) {
    const pythonBackend = pythonArtifacts.parseTree.backend ?? 'fallback';
    return {
      analyzed: false,
      operationCount: 0,
      issueCount: 1,
      issues: [
        {
          ...createFormalIssue({
            severity: 'error',
            code: 'formal.syntax-error',
            params: {
              languageLabel: 'Python',
            },
            ruleId: 'formal.syntax-error',
          }),
        },
      ],
      engineMeta: {
        language: 'python',
        parserBackend: pythonBackend,
        parserTier:
          pythonBackend === 'tree-sitter'
            ? 'tree-sitter-ast'
            : pythonBackend === 'generated' || pythonBackend === 'rust-wasm'
              ? 'structured-review'
              : 'pattern-fallback',
      },
    };
  }

  return verifyCircuitCodeConsistencyInternal(params, null, pythonArtifacts);
}
