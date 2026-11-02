import { sql } from './db';
import { SubjectDoc } from '../types';

export type SubjectNames = { en: string; af: string };

/** Display names for every subject in a school, keyed by the subject's stored name. Missing translations fall back to the stored name. */
export async function subjectNameMap(schoolId: string): Promise<Map<string, SubjectNames>> {
  const rows = await sql<{ data: SubjectDoc }[]>`SELECT data FROM items WHERE school_id = ${schoolId} AND type = 'subject'`;
  const map = new Map<string, SubjectNames>();
  for (const { data: d } of rows) {
    map.set(d.name, { en: d.names?.en?.trim() || d.name, af: d.names?.af?.trim() || d.name });
  }
  return map;
}

export const namesFor = (map: Map<string, SubjectNames>, subject: string): SubjectNames =>
  map.get(subject) ?? { en: subject, af: subject };
