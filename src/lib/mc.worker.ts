import { runMonteCarlo, type MCInput } from './montecarlo';

self.onmessage = (e: MessageEvent<{ id: number; input: MCInput }>) => {
  const result = runMonteCarlo(e.data.input);
  (self as unknown as Worker).postMessage({ id: e.data.id, result });
};
