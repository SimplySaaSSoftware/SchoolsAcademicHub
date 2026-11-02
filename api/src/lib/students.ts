import { sql } from './db';
import { pinLookup, generatePin } from './auth';
import { HttpError } from './middleware';
import { StudentDoc } from '../types';
import { randomUUID } from 'crypto';

export const publicStudent = (s: StudentDoc) => ({
  id: s.id, name: s.name, grade: s.grade, subjects: s.subjects ?? [], active: s.active, created_at: s.created_at,
});

export async function usedLookups(schoolId: string): Promise<Set<string>> {
  const rows = await sql<{ l: string }[]>`
    SELECT data->>'pin_lookup' AS l FROM items WHERE school_id = ${schoolId} AND type = 'student'`;
  return new Set(rows.map((r) => r.l));
}

/** A fresh 6-digit PIN that no student in this school already has. */
export function uniquePin(used: Set<string>): { pin: string; lookup: string } {
  for (let i = 0; i < 50; i++) {
    const pin = generatePin();
    const lookup = pinLookup(pin);
    if (!used.has(lookup)) { used.add(lookup); return { pin, lookup }; }
  }
  throw new HttpError(500, 'Could not generate a unique PIN');
}

export function makeStudent(schoolId: string, name: string, grade: number, lookup: string, subjects: string[] = []): StudentDoc {
  return {
    id: randomUUID(), school_id: schoolId, type: 'student',
    name: name.trim(), grade, pin_lookup: lookup, subjects, active: true, created_at: new Date().toISOString(),
  };
}

export function cleanName(v: unknown): string {
  const n = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!n) throw new HttpError(400, 'name required');
  if (n.length > 80) throw new HttpError(400, 'name too long');
  return n;
}

export function cleanGrade(v: unknown): number {
  const g = Number(v);
  if (!Number.isInteger(g) || g < 1 || g > 13) throw new HttpError(400, 'grade must be a number from 1 to 13');
  return g;
}

export function cleanSubjectList(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.map((s) => String(s).trim()).filter(Boolean))] : [];
}
