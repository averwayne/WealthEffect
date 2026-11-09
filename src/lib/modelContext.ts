import { createContext, useContext } from 'react';
import type { Model } from './model';

export const ModelContext = createContext<Model | null>(null);

export function useM(): Model {
  const m = useContext(ModelContext);
  if (!m) throw new Error('ModelContext missing');
  return m;
}
