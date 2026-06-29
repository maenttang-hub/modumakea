import test from 'node:test';
import assert from 'node:assert/strict';

type StoredProjectRow = {
  id: string;
  title: string;
  visibility: 'private' | 'unlisted' | 'public';
  state_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type StoredCommentRow = {
  id: string;
  project_id: string;
  author_id: string | null;
  content: string;
  target_type: 'canvas_coord' | 'node' | 'wire' | 'code_line';
  target_meta: Record<string, unknown>;
  status: 'open' | 'resolved' | 'orphaned';
  parent_id: string | null;
  created_at: string;
};

function createSupabaseMemoryFetch() {
  const projects = new Map<string, StoredProjectRow>();
  const comments = new Map<string, StoredCommentRow>();
  let projectCounter = 1;
  let commentCounter = 1;

  return async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = new URL(String(input));
    const table = url.pathname.split('/').pop();
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    const accept = new Headers(init?.headers).get('accept') ?? '';

    const asObject = accept.includes('application/vnd.pgrst.object+json');
    const now = () => new Date(`2026-06-18T12:00:${String(projectCounter + commentCounter).padStart(2, '0')}.000Z`).toISOString();

    if (table === 'projects') {
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
    }

    if (table === 'comments') {
      if (method === 'POST' && body) {
        const id = `comment-${commentCounter++}`;
        const row: StoredCommentRow = {
          id,
          project_id: String(body.project_id),
          author_id: null,
          content: String(body.content ?? ''),
          target_type: body.target_type as StoredCommentRow['target_type'],
          target_meta: (body.target_meta as Record<string, unknown>) ?? {},
          status: (body.status as StoredCommentRow['status']) ?? 'open',
          parent_id: typeof body.parent_id === 'string' ? body.parent_id : null,
          created_at: now(),
        };
        comments.set(id, row);
        return jsonResponse(asObject ? row : [row]);
      }

      const projectId = url.searchParams.get('project_id')?.replace(/^eq\./, '') ?? '';
      const commentId = url.searchParams.get('id')?.replace(/^eq\./, '') ?? '';

      if (method === 'GET') {
        const matching = [...comments.values()].filter(comment => {
          if (projectId && comment.project_id !== projectId) {
            return false;
          }
          if (commentId && comment.id !== commentId) {
            return false;
          }
          return true;
        });

        if (asObject) {
          return jsonResponse(matching[0] ?? null);
        }

        return jsonResponse(matching);
      }

      if (method === 'PATCH' && body) {
        const existing = comments.get(commentId);
        if (!existing || existing.project_id !== projectId) {
          return jsonResponse({ message: 'Not found' }, 404);
        }

        const next: StoredCommentRow = {
          ...existing,
          content: typeof body.content === 'string' ? body.content : existing.content,
          status: (body.status as StoredCommentRow['status']) ?? existing.status,
        };
        comments.set(commentId, next);
        return jsonResponse(asObject ? next : [next]);
      }
    }

    return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

test('shared project comment flow creates, replies, resolves, and reloads comments end-to-end', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://modumake-supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  globalThis.fetch = createSupabaseMemoryFetch();

  try {
    const { POST: createProjectPost } = await import('@/app/api/projects/route');
    const { POST: createCommentPost, GET: listCommentsGet } = await import('@/app/api/projects/[id]/comments/route');
    const { PATCH: updateCommentPatch } = await import('@/app/api/projects/[id]/comments/[commentId]/route');

    const createProjectResponse = await createProjectPost(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Shared Comment Flow',
          visibility: 'unlisted',
          stateJson: {
            projectName: 'Shared Comment Flow',
            activeBoardId: 'uno',
            components: [],
            pins: {},
            manualConnections: [],
          },
        }),
      })
    );

    assert.equal(createProjectResponse.status, 200);
    const createdProject = await createProjectResponse.json() as {
      project: { id: string };
      editToken: string;
    };

    const rootCommentResponse = await createCommentPost(
      new Request(`http://localhost/api/projects/${createdProject.project.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-modumake-edit-token': createdProject.editToken,
        },
        body: JSON.stringify({
          content: '이 센서는 보드에서 조금 더 떨어뜨려 주세요.',
          targetType: 'node',
          targetMeta: {
            nodeId: 'sensor-1',
            x: 420.4,
            y: 265.8,
          },
        }),
      }),
      { params: Promise.resolve({ id: createdProject.project.id }) }
    );

    assert.equal(rootCommentResponse.status, 200);
    const rootCommentPayload = await rootCommentResponse.json() as {
      comment: { id: string; targetMeta: { x?: number; y?: number } };
    };
    assert.equal(rootCommentPayload.comment.targetMeta.x, 420);
    assert.equal(rootCommentPayload.comment.targetMeta.y, 266);

    const replyResponse = await createCommentPost(
      new Request(`http://localhost/api/projects/${createdProject.project.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-modumake-edit-token': createdProject.editToken,
        },
        body: JSON.stringify({
          content: '좋아요, 이 위치에서 바로 수정해볼게요.',
          targetType: 'node',
          targetMeta: {
            nodeId: 'sensor-1',
          },
          parentId: rootCommentPayload.comment.id,
        }),
      }),
      { params: Promise.resolve({ id: createdProject.project.id }) }
    );

    assert.equal(replyResponse.status, 200);

    const resolveResponse = await updateCommentPatch(
      new Request(`http://localhost/api/projects/${createdProject.project.id}/comments/${rootCommentPayload.comment.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-modumake-edit-token': createdProject.editToken,
        },
        body: JSON.stringify({
          status: 'resolved',
        }),
      }),
      {
        params: Promise.resolve({
          id: createdProject.project.id,
          commentId: rootCommentPayload.comment.id,
        }),
      }
    );

    assert.equal(resolveResponse.status, 200);
    const resolvedPayload = await resolveResponse.json() as {
      comment: { status: string };
    };
    assert.equal(resolvedPayload.comment.status, 'resolved');

    const listResponse = await listCommentsGet(
      new Request(`http://localhost/api/projects/${createdProject.project.id}/comments`, {
        method: 'GET',
        headers: {
          'x-modumake-edit-token': createdProject.editToken,
        },
      }),
      { params: Promise.resolve({ id: createdProject.project.id }) }
    );

    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json() as {
      comments: Array<{ id: string; parentId: string | null; status: string }>;
    };
    assert.equal(listPayload.comments.length, 2);
    assert.equal(listPayload.comments[0].parentId, null);
    assert.equal(listPayload.comments[0].status, 'resolved');
    assert.equal(listPayload.comments[1].parentId, rootCommentPayload.comment.id);
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
