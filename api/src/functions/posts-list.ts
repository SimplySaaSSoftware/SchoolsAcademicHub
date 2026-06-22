import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryItems } from '../lib/cosmos';
import { requireAuth, requireSchoolMatch, errorResponse } from '../lib/middleware';
import { PostDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt       = requireAuth(req);
    const school_id = req.query.get('school_id') ?? jwt.school_id;
    requireSchoolMatch(jwt, school_id);

    const grade   = req.query.get('grade');
    const subject = req.query.get('subject');
    const term    = req.query.get('term');
    const isStudent = jwt.role === 'student';
    const isTeacher = jwt.role === 'teacher';

    let query = 'SELECT c.id, c.title, c.grade, c.subject, c.term, c.status, c.author_name, c.created_at, c.updated_at, c.quiz_json, c.attachments_json FROM c WHERE c.school_id = @sid AND c.type = @type';
    const params: { name: string; value: any }[] = [
      { name: '@sid',  value: school_id },
      { name: '@type', value: 'post'    },
    ];

    if (isStudent) {
      query += ' AND c.status = @status';
      params.push({ name: '@status', value: 'published' });
    }

    const gradeFilter = isTeacher && !grade ? jwt.grade : grade ? Number(grade) : undefined;
    if (gradeFilter) {
      query += ' AND c.grade = @grade';
      params.push({ name: '@grade', value: gradeFilter });
    }
    if (subject) {
      query += ' AND c.subject = @subject';
      params.push({ name: '@subject', value: subject });
    }
    if (term) {
      query += ' AND c.term = @term';
      params.push({ name: '@term', value: term });
    }

    query += ' ORDER BY c.created_at DESC';

    const posts = await queryItems<Omit<PostDoc, 'audit' | 'content_html'>>(
      { query, parameters: params },
      school_id
    );

    return { jsonBody: posts };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'posts',
  handler,
});
