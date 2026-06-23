import { dbAll } from "@/lib/db";

export type CommentReaction = { emoji: string; count: number; mine: boolean };

export type CommentAttachment = {
  id: number;
  name: string;
  type: string;
  data: string;
};

export type CommentNode = {
  id: number;
  user_id: string | null;
  user_name: string | null;
  user_image: string | null;
  body: string;
  created_at: string;
  updated_at: string | null;
  mine: boolean;
  reactions: CommentReaction[];
  attachments: CommentAttachment[];
  replies: CommentNode[];
};

type CommentRow = {
  id: number;
  parent_id: number | null;
  user_id: string | null;
  user_name: string | null;
  user_image: string | null;
  body: string;
  created_at: string;
  updated_at: string | null;
};

type ReactionRow = { comment_id: number; emoji: string; user_id: string };

// Load a task's comments as a one-level thread tree (top-level comments, each
// with a flat list of replies), with reactions grouped per comment and `mine`
// flags resolved for the requesting user.
export async function fetchCommentTree(
  taskId: number | string,
  userId: string | null
): Promise<CommentNode[]> {
  const rows = await dbAll<CommentRow>(
    `SELECT c.id, c.parent_id, c.user_id, u.name AS user_name, u.image AS user_image,
            c.body, c.created_at, c.updated_at
     FROM task_comments c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.task_id = ?
     ORDER BY c.created_at ASC, c.id ASC`,
    [taskId]
  );
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => "?").join(",");
  const reactions = await dbAll<ReactionRow>(
    `SELECT comment_id, emoji, user_id FROM comment_reactions WHERE comment_id IN (${ph})`,
    ids
  );

  const attachments = await dbAll<CommentAttachment & { comment_id: number }>(
    `SELECT comment_id, id, name, type, data FROM comment_attachments WHERE comment_id IN (${ph})`,
    ids
  );
  const attachByComment = new Map<number, CommentAttachment[]>();
  for (const a of attachments) {
    const list = attachByComment.get(a.comment_id) ?? [];
    list.push({ id: a.id, name: a.name, type: a.type, data: a.data });
    attachByComment.set(a.comment_id, list);
  }

  const reactByComment = new Map<
    number,
    Map<string, { count: number; mine: boolean }>
  >();
  for (const r of reactions) {
    let m = reactByComment.get(r.comment_id);
    if (!m) {
      m = new Map();
      reactByComment.set(r.comment_id, m);
    }
    const e = m.get(r.emoji) ?? { count: 0, mine: false };
    e.count += 1;
    if (userId && r.user_id === userId) e.mine = true;
    m.set(r.emoji, e);
  }

  const toNode = (r: CommentRow): CommentNode => {
    const rm = reactByComment.get(r.id);
    return {
      id: r.id,
      user_id: r.user_id,
      user_name: r.user_name,
      user_image: r.user_image,
      body: r.body,
      created_at: r.created_at,
      updated_at: r.updated_at,
      mine: !!userId && r.user_id === userId,
      reactions: rm
        ? [...rm.entries()].map(([emoji, v]) => ({
            emoji,
            count: v.count,
            mine: v.mine,
          }))
        : [],
      attachments: attachByComment.get(r.id) ?? [],
      replies: [],
    };
  };

  const nodes = new Map<number, CommentNode>();
  for (const r of rows) nodes.set(r.id, toNode(r));

  const roots: CommentNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    if (r.parent_id != null && nodes.has(r.parent_id)) {
      nodes.get(r.parent_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
