import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql } from '../lib/db';
import { requireAuth, requireRole, errorResponse, effectiveSchoolId } from '../lib/middleware';

interface Bucket {
  grade: number;
  subject: string;
  posts_total: number;
  published: number;
  drafts: number;
  quizzes: number;
  views: number;
  unique_viewers: number;
  attempts: number;
  avg_score: number | null;
  pass_rate: number | null;
  last_activity: string | null;
  posts: Record<string, PostStat>;
}

interface PostStat {
  id: string;
  unique_viewers: number;
  views: number;
  attempts: number;
  avg_score: number | null;
  pass_rate: number | null;
}

/**
 * GET /dashboard/subjects[?grade=N]
 * Per grade + subject overview of posts and engagement stats.
 * Teachers are locked to their own grade; admins may filter by grade or see all.
 */
async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);
    const schoolId = effectiveSchoolId(req, jwt);

    const gradeParam = req.query.get('grade');
    const grade = jwt.role === 'teacher' && jwt.grade
      ? Number(jwt.grade)
      : (gradeParam ? Number(gradeParam) : null);
    const gradeClause = grade ? sql` AND (data->>'grade')::int = ${grade}` : sql``;

    const [postRows, viewRows, attemptRows] = await Promise.all([
      sql<{ id: string; grade: string; subject: string; status: string; quiz_json: string }[]>`
        SELECT id, data->>'grade' AS grade, data->>'subject' AS subject,
               data->>'status' AS status, data->>'quiz_json' AS quiz_json
        FROM items
        WHERE school_id = ${schoolId} AND type = 'post'${gradeClause}`,
      sql<{ post_id: string; student_id: string; ts: string }[]>`
        SELECT data->>'post_id' AS post_id, data->>'student_id' AS student_id, data->>'timestamp' AS ts
        FROM items
        WHERE school_id = ${schoolId} AND type = 'activity'${gradeClause}`,
      sql<{ post_id: string; percentage: string; passed: string; ts: string }[]>`
        SELECT data->>'post_id' AS post_id, data->>'percentage' AS percentage,
               data->>'passed' AS passed, data->>'created_at' AS ts
        FROM items
        WHERE school_id = ${schoolId} AND type = 'quiz_attempt'${gradeClause}`,
    ]);

    const buckets = new Map<string, Bucket>();
    const postBucket = new Map<string, Bucket>();

    for (const p of postRows) {
      const g = Number(p.grade);
      const subject = p.subject || 'Unassigned';
      const key = `${g}|${subject}`;
      let b = buckets.get(key);
      if (!b) {
        b = {
          grade: g, subject, posts_total: 0, published: 0, drafts: 0, quizzes: 0,
          views: 0, unique_viewers: 0, attempts: 0, avg_score: null, pass_rate: null,
          last_activity: null, posts: {},
        };
        buckets.set(key, b);
      }
      b.posts_total++;
      if (p.status === 'published') b.published++; else b.drafts++;
      try { if (JSON.parse(p.quiz_json || '[]').length > 0) b.quizzes++; } catch { /* ignore */ }
      b.posts[p.id] = { id: p.id, unique_viewers: 0, views: 0, attempts: 0, avg_score: null, pass_rate: null };
      postBucket.set(p.id, b);
    }

    const bucketViewers = new Map<Bucket, Set<string>>();
    const postViewers = new Map<string, Set<string>>();
    const bump = (b: Bucket, ts: string | null) => {
      if (ts && (!b.last_activity || ts > b.last_activity)) b.last_activity = ts;
    };

    for (const v of viewRows) {
      const b = postBucket.get(v.post_id);
      if (!b) continue;
      b.views++;
      b.posts[v.post_id].views++;
      if (!bucketViewers.has(b)) bucketViewers.set(b, new Set());
      bucketViewers.get(b)!.add(v.student_id);
      if (!postViewers.has(v.post_id)) postViewers.set(v.post_id, new Set());
      postViewers.get(v.post_id)!.add(v.student_id);
      bump(b, v.ts);
    }
    for (const [b, set] of bucketViewers) b.unique_viewers = set.size;
    for (const [pid, set] of postViewers) postBucket.get(pid)!.posts[pid].unique_viewers = set.size;

    const sums = new Map<Bucket, { total: number; pass: number }>();
    const postSums = new Map<string, { total: number; pass: number }>();
    for (const a of attemptRows) {
      const b = postBucket.get(a.post_id);
      if (!b) continue;
      const pct = Number(a.percentage);
      const passed = a.passed === 'true';
      b.attempts++;
      const ps = b.posts[a.post_id];
      ps.attempts++;
      const s = sums.get(b) ?? { total: 0, pass: 0 };
      s.total += pct; if (passed) s.pass++;
      sums.set(b, s);
      const q = postSums.get(a.post_id) ?? { total: 0, pass: 0 };
      q.total += pct; if (passed) q.pass++;
      postSums.set(a.post_id, q);
      bump(b, a.ts);
    }
    for (const [b, s] of sums) {
      b.avg_score = Math.round(s.total / b.attempts);
      b.pass_rate = Math.round((s.pass / b.attempts) * 100);
    }
    for (const [pid, s] of postSums) {
      const ps = postBucket.get(pid)!.posts[pid];
      ps.avg_score = Math.round(s.total / ps.attempts);
      ps.pass_rate = Math.round((s.pass / ps.attempts) * 100);
    }

    const result = [...buckets.values()]
      .sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject));

    return { jsonBody: result };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('dashboard-subjects', { methods: ['GET'], authLevel: 'anonymous', route: 'dashboard/subjects', handler });
