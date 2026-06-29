import test from 'node:test';
import assert from 'node:assert/strict';

import { importKiCadSchematic } from '@/lib/kicad-sch-parser';
import type { ModuMakeProjectData } from '@/types';

type StoredProjectRow = {
  id: string;
  title: string;
  visibility: 'private' | 'unlisted' | 'public';
  state_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createSupabaseMemoryFetch() {
  const projects = new Map<string, StoredProjectRow>();
  let projectCounter = 1;

  return async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = new URL(String(input));
    const table = url.pathname.split('/').pop();
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    const asObject = (headers.get('accept') ?? '').includes('application/vnd.pgrst.object+json');
    const now = () => new Date(`2026-06-19T02:00:${String(projectCounter).padStart(2, '0')}.000Z`).toISOString();

    if (table !== 'projects') {
      return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
    }

    if (method === 'POST' && body) {
      const id = `project-${projectCounter++}`;
      const row: StoredProjectRow = {
        id,
        title: String(body.title ?? 'Untitled Project'),
        visibility: (body.visibility as StoredProjectRow['visibility']) ?? 'unlisted',
        state_json: (body.state_json as Record<string, unknown>) ?? {},
        created_at: now(),
        updated_at: now(),
      };
      projects.set(id, row);
      return jsonResponse(asObject ? row : [row]);
    }

    const projectId = url.searchParams.get('id')?.replace(/^eq\./, '') ?? '';
    const existing = projects.get(projectId);
    if (!existing) {
      return jsonResponse({ message: 'Not found' }, 404);
    }

    if (method === 'GET') {
      return jsonResponse(asObject ? existing : [existing]);
    }

    if (method === 'PATCH' && body) {
      const next: StoredProjectRow = {
        ...existing,
        title: String(body.title ?? existing.title),
        visibility: (body.visibility as StoredProjectRow['visibility']) ?? existing.visibility,
        state_json: (body.state_json as Record<string, unknown>) ?? existing.state_json,
        updated_at: String(body.updated_at ?? now()),
      };
      projects.set(projectId, next);
      return jsonResponse(asObject ? next : [next]);
    }

    return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
  };
}

function createImportedSchematicProject(): ModuMakeProjectData {
  return {
    version: 3,
    savedAt: '2026-06-19T02:00:00.000Z',
    projectName: 'Cloud KiCad Import',
    appLanguage: 'ko',
    activeBoardId: 'kicad_generic',
    pins: {},
    components: [
      {
        instanceId: 'imported-j1',
        templateId: 'kicad_raspberry_pi_2_3',
        name: 'Raspberry_Pi_2_3',
        value: 'Raspberry_Pi_2_3',
        position: { x: 420, y: 260 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
        importedReference: 'J1',
        importedGeometry: {
          bounds: { minX: -18, minY: -38, maxX: 18, maxY: 38 },
          renderSource: 'primitive',
          pinRenderMode: 'primitive',
          primitives: [
            { kind: 'rect', start: { x: -18, y: -38 }, end: { x: 18, y: 38 } },
            {
              kind: 'text',
              at: { x: -12, y: -20 },
              text: 'GPIO14/TXD',
              angle: 0,
              sizeMm: 1.27,
              role: 'pin-name',
            },
            {
              kind: 'text',
              at: { x: 16, y: -20 },
              text: '8',
              angle: 0,
              sizeMm: 1.27,
              role: 'pin-number',
            },
          ],
          pinAnchors: [
            { pinId: 'GPIO14/TXD', label: 'GPIO14/TXD', number: '8', at: { x: 18, y: -20 }, angle: 0, lengthMm: 2.54 },
          ],
          referenceLabel: 'J1',
          valueLabel: 'Raspberry_Pi_2_3',
        },
      },
    ],
    manualConnections: [],
    importedSchematicScene: {
      wireSegments: [
        { start: { x: 120, y: 90 }, end: { x: 220, y: 90 } },
        { start: { x: 220, y: 90 }, end: { x: 220, y: 180 } },
      ],
      junctions: [{ x: 220, y: 90 }],
      labels: [{ text: '3V3', at: { x: 160, y: 90 } }],
      pageFrame: {
        start: { x: 0, y: 0 },
        end: { x: 1650, y: 1167 },
        paper: 'A4',
        titleBlock: {
          title: 'Cloud KiCad Import',
          date: '2026-06-19',
          rev: 'A',
          company: 'ModuMake',
          comments: ['Cloud save must preserve imported geometry'],
        },
      },
      sheetFrames: [
        {
          start: { x: 40, y: 40 },
          end: { x: 620, y: 360 },
          name: 'main',
          file: 'rasphat_proj2.kicad_sch',
          pins: [{ text: 'button_input', at: { x: 620, y: 150 }, angle: 0 }],
        },
      ],
    },
    templateCache: {},
    installedLibraries: [],
    generatedCode: '',
    codeError: null,
    lastCodeGenerationMeta: null,
    customComponentPackages: [],
    powerInputMode: 'usb-5v',
    workspaceMode: 'schematic',
    wiringMode: 'manual',
    showGrid: true,
    showMinimap: true,
    schematicTheme: 'dark',
    isGuestStudentMode: false,
  };
}

function buildRecoverableImportedSource() {
  return `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Sensor:DHT22"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "DHT22" (id 1) (at 0 -2.54 0))
      (symbol "DHT22_1_1"
        (rectangle (start -5.08 -5.08) (end 5.08 5.08) (stroke (width 0)) (fill (type none)))
        (pin power_in line (at -7.62 -2.54 0) (length 2.54)
          (name "VDD" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin input line (at -7.62 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
        (pin no_connect line (at -7.62 2.54 0) (length 2.54)
          (name "NC" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.27 1.27)))))
        (pin power_in line (at 0 7.62 270) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "4" (effects (font (size 1.27 1.27))))))
    ))
  (symbol
    (lib_id "Sensor:DHT22")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "sensor-cloud-repair-1")
    (property "Reference" "U1" (id 0) (at 50.8 44.45 0))
    (property "Value" "DHT22" (id 1) (at 50.8 57.15 0)))
  (wire
    (pts (xy 43.18 50.8) (xy 30.48 50.8))
    (stroke (width 0) (type default))
    (uuid "wire-data"))
  (sheet_instances
    (path "/" (page "1")))
)`;
}

test('cloud project API preserves imported KiCad schematic geometry through create, read, and update', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://modumake-supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  globalThis.fetch = createSupabaseMemoryFetch();

  try {
    const { POST: createProjectPost } = await import('@/app/api/projects/route');
    const { GET: getProjectGet, PATCH: updateProjectPatch } = await import('@/app/api/projects/[id]/route');

    const originalProject = createImportedSchematicProject();
    const createResponse = await createProjectPost(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: originalProject.projectName,
          visibility: 'unlisted',
          stateJson: originalProject,
        }),
      })
    );

    assert.equal(createResponse.status, 200);
    const created = await createResponse.json() as {
      project: { id: string; stateJson: ModuMakeProjectData };
      editToken: string;
    };

    assert.equal(created.project.stateJson.activeBoardId, 'kicad_generic');
    assert.equal(created.project.stateJson.importedSchematicScene?.pageFrame?.paper, 'A4');
    assert.equal(created.project.stateJson.importedSchematicScene?.wireSegments.length, 2);
    assert.deepEqual(created.project.stateJson.importedSchematicScene?.wireSegments[0], {
      start: { x: 120, y: 90 },
      end: { x: 220, y: 90 },
    });
    assert.equal(created.project.stateJson.components[0]?.importedGeometry?.pinRenderMode, 'primitive');

    const readResponse = await getProjectGet(
      new Request(`http://localhost/api/projects/${created.project.id}`, {
        headers: { 'x-modumake-edit-token': created.editToken },
      }),
      { params: Promise.resolve({ id: created.project.id }) }
    );
    assert.equal(readResponse.status, 200);
    const read = await readResponse.json() as { project: { stateJson: ModuMakeProjectData } };
    assert.equal(read.project.stateJson.importedSchematicScene?.labels[0]?.text, '3V3');
    assert.equal(read.project.stateJson.importedSchematicScene?.sheetFrames?.[0]?.pins[0]?.text, 'button_input');
    assert.deepEqual(read.project.stateJson.components[0]?.position, { x: 420, y: 260 });

    const updatedProject: ModuMakeProjectData = {
      ...read.project.stateJson,
      schematicTheme: 'light',
      importedSchematicScene: {
        ...read.project.stateJson.importedSchematicScene!,
        wireSegments: [
          ...(read.project.stateJson.importedSchematicScene?.wireSegments ?? []),
          { start: { x: 300, y: 300 }, end: { x: 380, y: 300 } },
        ],
      },
    };
    const updateResponse = await updateProjectPatch(
      new Request(`http://localhost/api/projects/${created.project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-modumake-edit-token': created.editToken,
        },
        body: JSON.stringify({
          title: updatedProject.projectName,
          visibility: 'unlisted',
          stateJson: updatedProject,
        }),
      }),
      { params: Promise.resolve({ id: created.project.id }) }
    );
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json() as { project: { stateJson: ModuMakeProjectData } };
    assert.equal(updated.project.stateJson.schematicTheme, 'light');
    assert.equal(updated.project.stateJson.importedSchematicScene?.wireSegments.length, 3);
    assert.deepEqual(updated.project.stateJson.importedSchematicScene?.wireSegments[2], {
      start: { x: 300, y: 300 },
      end: { x: 380, y: 300 },
    });
    assert.equal(updated.project.stateJson.importedSchematicScene?.pageFrame?.titleBlock?.title, 'Cloud KiCad Import');
    assert.deepEqual(
      updated.project.stateJson.components[0]?.importedGeometry?.primitives.flatMap(primitive =>
        primitive.kind === 'text' ? [primitive.role] : []
      ),
      ['pin-name', 'pin-number']
    );
  } finally {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }

    globalThis.fetch = originalFetch;
  }
});

test('cloud project API rejects empty imported schematic overwrite and keeps previous drawing', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://modumake-supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  globalThis.fetch = createSupabaseMemoryFetch();

  try {
    const { POST: createProjectPost } = await import('@/app/api/projects/route');
    const { GET: getProjectGet, PATCH: updateProjectPatch } = await import('@/app/api/projects/[id]/route');

    const originalProject = createImportedSchematicProject();
    const createResponse = await createProjectPost(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: originalProject.projectName,
          visibility: 'unlisted',
          stateJson: originalProject,
        }),
      })
    );
    assert.equal(createResponse.status, 200);

    const created = await createResponse.json() as {
      project: { id: string; stateJson: ModuMakeProjectData };
      editToken: string;
    };
    const emptyImportedProject: ModuMakeProjectData = {
      ...created.project.stateJson,
      components: [],
      manualConnections: [],
      importedSchematicScene: null,
    };

    const updateResponse = await updateProjectPatch(
      new Request(`http://localhost/api/projects/${created.project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-modumake-edit-token': created.editToken,
        },
        body: JSON.stringify({
          title: emptyImportedProject.projectName,
          visibility: 'unlisted',
          stateJson: emptyImportedProject,
        }),
      }),
      { params: Promise.resolve({ id: created.project.id }) }
    );
    assert.equal(updateResponse.status, 503);

    const readResponse = await getProjectGet(
      new Request(`http://localhost/api/projects/${created.project.id}`, {
        headers: { 'x-modumake-edit-token': created.editToken },
      }),
      { params: Promise.resolve({ id: created.project.id }) }
    );
    assert.equal(readResponse.status, 200);
    const read = await readResponse.json() as { project: { stateJson: ModuMakeProjectData } };

    assert.equal(read.project.stateJson.components.length, 1);
    assert.equal(read.project.stateJson.components[0]?.instanceId, 'imported-j1');
    assert.equal(read.project.stateJson.importedSchematicScene?.wireSegments.length, 2);
  } finally {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }

    globalThis.fetch = originalFetch;
  }
});

test('cloud project API rejects imported overwrite when the KiCad scene disappears but components remain', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://modumake-supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  globalThis.fetch = createSupabaseMemoryFetch();

  try {
    const { POST: createProjectPost } = await import('@/app/api/projects/route');
    const { GET: getProjectGet, PATCH: updateProjectPatch } = await import('@/app/api/projects/[id]/route');

    const originalProject = createImportedSchematicProject();
    const createResponse = await createProjectPost(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: originalProject.projectName,
          visibility: 'unlisted',
          stateJson: originalProject,
        }),
      })
    );
    assert.equal(createResponse.status, 200);

    const created = await createResponse.json() as {
      project: { id: string; stateJson: ModuMakeProjectData };
      editToken: string;
    };

    const sceneMissingProject: ModuMakeProjectData = {
      ...created.project.stateJson,
      importedSchematicScene: null,
    };

    const updateResponse = await updateProjectPatch(
      new Request(`http://localhost/api/projects/${created.project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-modumake-edit-token': created.editToken,
        },
        body: JSON.stringify({
          title: sceneMissingProject.projectName,
          visibility: 'unlisted',
          stateJson: sceneMissingProject,
        }),
      }),
      { params: Promise.resolve({ id: created.project.id }) }
    );
    assert.equal(updateResponse.status, 503);

    const readResponse = await getProjectGet(
      new Request(`http://localhost/api/projects/${created.project.id}`, {
        headers: { 'x-modumake-edit-token': created.editToken },
      }),
      { params: Promise.resolve({ id: created.project.id }) }
    );
    assert.equal(readResponse.status, 200);
    const read = await readResponse.json() as { project: { stateJson: ModuMakeProjectData } };
    assert.equal(read.project.stateJson.importedSchematicScene?.wireSegments.length, 2);
    assert.ok(read.project.stateJson.components[0]?.importedGeometry);
  } finally {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }

    globalThis.fetch = originalFetch;
  }
});

test('cloud project API rejects imported overwrite when an existing imported cloud project collapses to zero components on a mapped board', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://modumake-supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  globalThis.fetch = createSupabaseMemoryFetch();

  try {
    const { POST: createProjectPost } = await import('@/app/api/projects/route');
    const { GET: getProjectGet, PATCH: updateProjectPatch } = await import('@/app/api/projects/[id]/route');

    const originalProject = createImportedSchematicProject();
    const createResponse = await createProjectPost(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: originalProject.projectName,
          visibility: 'unlisted',
          stateJson: originalProject,
        }),
      })
    );
    assert.equal(createResponse.status, 200);

    const created = await createResponse.json() as {
      project: { id: string; stateJson: ModuMakeProjectData };
      editToken: string;
    };

    const collapsedProject: ModuMakeProjectData = {
      ...created.project.stateJson,
      activeBoardId: 'uno',
      components: [],
      manualConnections: [],
      importedSchematicScene: null,
    };

    const updateResponse = await updateProjectPatch(
      new Request(`http://localhost/api/projects/${created.project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-modumake-edit-token': created.editToken,
        },
        body: JSON.stringify({
          title: collapsedProject.projectName,
          visibility: 'unlisted',
          stateJson: collapsedProject,
        }),
      }),
      { params: Promise.resolve({ id: created.project.id }) }
    );
    assert.equal(updateResponse.status, 503);

    const readResponse = await getProjectGet(
      new Request(`http://localhost/api/projects/${created.project.id}`, {
        headers: { 'x-modumake-edit-token': created.editToken },
      }),
      { params: Promise.resolve({ id: created.project.id }) }
    );
    assert.equal(readResponse.status, 200);
    const read = await readResponse.json() as { project: { stateJson: ModuMakeProjectData } };

    assert.equal(read.project.stateJson.components.length, 1);
    assert.equal(read.project.stateJson.importedSchematicScene?.wireSegments.length, 2);
  } finally {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }

    globalThis.fetch = originalFetch;
  }
});

test('cloud project API repairs recoverable imported scenes from source text before create and update', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://modumake-supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  globalThis.fetch = createSupabaseMemoryFetch();

  try {
    const { POST: createProjectPost } = await import('@/app/api/projects/route');
    const { PATCH: updateProjectPatch } = await import('@/app/api/projects/[id]/route');

    const imported = importKiCadSchematic(buildRecoverableImportedSource(), {
      projectName: 'Recoverable cloud import',
    });

    const repairableCreatePayload: ModuMakeProjectData = {
      ...imported.document,
      importedSchematicScene: null,
    };

    const createResponse = await createProjectPost(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: repairableCreatePayload.projectName,
          visibility: 'unlisted',
          stateJson: repairableCreatePayload,
        }),
      })
    );

    assert.equal(createResponse.status, 200);
    const created = await createResponse.json() as {
      project: { id: string; stateJson: ModuMakeProjectData };
      editToken: string;
    };

    assert.ok((created.project.stateJson.importedSchematicScene?.wireSegments.length ?? 0) > 0);
    assert.ok((created.project.stateJson.components[0]?.importedGeometry?.primitives.length ?? 0) > 0);

    const repairableUpdatePayload: ModuMakeProjectData = {
      ...created.project.stateJson,
      importedSchematicScene: null,
    };

    const updateResponse = await updateProjectPatch(
      new Request(`http://localhost/api/projects/${created.project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-modumake-edit-token': created.editToken,
        },
        body: JSON.stringify({
          title: repairableUpdatePayload.projectName,
          visibility: 'unlisted',
          stateJson: repairableUpdatePayload,
        }),
      }),
      { params: Promise.resolve({ id: created.project.id }) }
    );

    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json() as {
      project: { stateJson: ModuMakeProjectData };
    };

    assert.ok((updated.project.stateJson.importedSchematicScene?.wireSegments.length ?? 0) > 0);
    assert.ok((updated.project.stateJson.components[0]?.importedGeometry?.pinAnchors.length ?? 0) > 0);
  } finally {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }

    globalThis.fetch = originalFetch;
  }
});

test('cloud project API repairs a stored imported project on read when only source text remains', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://modumake-supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  globalThis.fetch = createSupabaseMemoryFetch();

  try {
    const { POST: createProjectPost } = await import('@/app/api/projects/route');
    const { GET: getProjectGet } = await import('@/app/api/projects/[id]/route');

    const imported = importKiCadSchematic(buildRecoverableImportedSource(), {
      projectName: 'Recover on read',
    });

    const createResponse = await createProjectPost(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: imported.document.projectName,
          visibility: 'unlisted',
          stateJson: {
            ...imported.document,
            importedSchematicScene: null,
          },
        }),
      })
    );

    assert.equal(createResponse.status, 200);
    const created = await createResponse.json() as {
      project: { id: string; stateJson: ModuMakeProjectData };
      editToken: string;
    };

    const readResponse = await getProjectGet(
      new Request(`http://localhost/api/projects/${created.project.id}`, {
        headers: { 'x-modumake-edit-token': created.editToken },
      }),
      { params: Promise.resolve({ id: created.project.id }) }
    );

    assert.equal(readResponse.status, 200);
    const read = await readResponse.json() as {
      project: { stateJson: ModuMakeProjectData };
    };

    assert.ok((read.project.stateJson.importedSchematicScene?.wireSegments.length ?? 0) > 0);
    assert.ok((read.project.stateJson.components[0]?.importedGeometry?.pinAnchors.length ?? 0) > 0);
  } finally {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }

    globalThis.fetch = originalFetch;
  }
});

test('cloud project API prefers canonical KiCad source over a stale but still renderable imported scene snapshot', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://modumake-supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  globalThis.fetch = createSupabaseMemoryFetch();

  try {
    const { POST: createProjectPost } = await import('@/app/api/projects/route');
    const { GET: getProjectGet } = await import('@/app/api/projects/[id]/route');

    const imported = importKiCadSchematic(buildRecoverableImportedSource(), {
      projectName: 'Recover canonical source over stale scene',
    });

    const staleScenePayload: ModuMakeProjectData = {
      ...imported.document,
      importedSchematicScene: {
        ...(imported.document.importedSchematicScene ?? {
          wireSegments: [],
          junctions: [],
          labels: [],
          pageFrame: null,
          sheetFrames: [],
        }),
        wireSegments: (imported.document.importedSchematicScene?.wireSegments ?? []).map(segment => ({
          start: { x: segment.start.x + 640, y: segment.start.y + 320 },
          end: { x: segment.end.x + 640, y: segment.end.y + 320 },
        })),
        junctions: (imported.document.importedSchematicScene?.junctions ?? []).map(point => ({
          x: point.x + 640,
          y: point.y + 320,
        })),
        labels: (imported.document.importedSchematicScene?.labels ?? []).map(label => ({
          ...label,
          at: { x: label.at.x + 640, y: label.at.y + 320 },
        })),
      },
    };

    const createResponse = await createProjectPost(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: staleScenePayload.projectName,
          visibility: 'unlisted',
          stateJson: staleScenePayload,
        }),
      })
    );

    assert.equal(createResponse.status, 200);
    const created = await createResponse.json() as {
      project: { id: string; stateJson: ModuMakeProjectData };
      editToken: string;
    };

    const createdSegment = created.project.stateJson.importedSchematicScene?.wireSegments[0];
    const canonicalSegment = imported.document.importedSchematicScene?.wireSegments[0];

    assert.ok(createdSegment);
    assert.ok(canonicalSegment);
    assert.deepEqual(createdSegment, canonicalSegment);

    const readResponse = await getProjectGet(
      new Request(`http://localhost/api/projects/${created.project.id}`, {
        headers: { 'x-modumake-edit-token': created.editToken },
      }),
      { params: Promise.resolve({ id: created.project.id }) }
    );

    assert.equal(readResponse.status, 200);
    const read = await readResponse.json() as {
      project: { stateJson: ModuMakeProjectData };
    };

    assert.deepEqual(
      read.project.stateJson.importedSchematicScene?.wireSegments[0],
      canonicalSegment
    );
  } finally {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }

    globalThis.fetch = originalFetch;
  }
});
