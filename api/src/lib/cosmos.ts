import { CosmosClient, Container, SqlQuerySpec } from '@azure/cosmos';

const endpoint = process.env.COSMOS_ENDPOINT!;
const key      = process.env.COSMOS_KEY!;
const dbName   = process.env.COSMOS_DB    ?? 'hps-hub';
const contName = process.env.COSMOS_CONTAINER ?? 'main';

let _container: Container | null = null;

function getContainer(): Container {
  if (!_container) {
    const client = new CosmosClient({ endpoint, key });
    _container = client.database(dbName).container(contName);
  }
  return _container;
}

export async function getItem<T>(id: string, school_id: string): Promise<T | null> {
  try {
    const { resource } = await getContainer().item(id, school_id).read();
    return (resource ?? null) as T | null;
  } catch (err: any) {
    if (err.code === 404) return null;
    throw err;
  }
}

export async function queryItems<T>(query: SqlQuerySpec, school_id?: string): Promise<T[]> {
  const options = school_id ? { partitionKey: school_id } : undefined;
  const { resources } = await getContainer().items.query(query, options).fetchAll();
  return resources as T[];
}

export async function createItem<T>(item: T): Promise<T> {
  const { resource } = await getContainer().items.create(item as object);
  return resource as T;
}

export async function upsertItem<T>(item: T): Promise<T> {
  const { resource } = await getContainer().items.upsert(item as object);
  return resource as T;
}

export async function updateItem<T>(id: string, school_id: string, updates: Partial<T>): Promise<T> {
  const existing = await getItem<any>(id, school_id);
  if (!existing) throw new Error(`Item ${id} not found`);
  const merged = { ...existing, ...updates };
  const { resource } = await getContainer().items.upsert(merged);
  return resource as T;
}

export async function deleteItem(id: string, school_id: string): Promise<void> {
  await getContainer().item(id, school_id).delete();
}

export async function getSchoolBySlug(slug: string) {
  const { resources } = await getContainer().items.query({
    query: 'SELECT * FROM c WHERE c.type = @type AND c.school_id = @slug',
    parameters: [
      { name: '@type', value: 'school' },
      { name: '@slug', value: slug },
    ],
  }).fetchAll();
  return resources[0] ?? null;
}
