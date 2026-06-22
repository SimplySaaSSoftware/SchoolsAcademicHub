import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryItems } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse } from '../lib/middleware';
import { ActivityDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const activities = await queryItems<ActivityDoc>(
      {
        query: 'SELECT * FROM c WHERE c.school_id = @sid AND c.type = @type AND c.post_id = @pid ORDER BY c.timestamp ASC',
        parameters: [
          { name: '@sid',  value: jwt.school_id },
          { name: '@type', value: 'activity' },
          { name: '@pid',  value: req.params.id },
        ],
      },
      jwt.school_id
    );

    return { jsonBody: activities };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-viewers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'posts/{id}/viewers',
  handler,
});
