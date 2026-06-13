import { ulid } from 'ulid';

export type IdPrefix = 'ws' | 'usr' | 'evt' | 'src' | 'agt' | 'repo' | 'wh' | 'rule';

/** Prefixed ULID primary keys, e.g. newId('evt') -> 'evt_01J9XQ8KZ3...'. */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}
