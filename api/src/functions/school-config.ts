import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getSchoolBySlug } from '../lib/db';
import { errorResponse } from '../lib/middleware';

async function handler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const slug   = req.params.slug;
    const school = await getSchoolBySlug(slug);
    if (!school || !school.active) return { status: 404, jsonBody: { error: 'School not found' } };

    return {
      jsonBody: {
        slug:          school.slug,
        name:          school.name,
        logo_url:      school.logo_url,
        primary_colour: school.primary_colour,
        auth_mode:     school.auth_mode,
        student_auth:  school.student_auth,
        grades:        school.grades,
      },
    };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('school-config', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'school/config/{slug}',
  handler,
});
