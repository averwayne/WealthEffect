import { useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { Landing } from './components/Landing';
import { Onboarding } from './components/Onboarding';
import { useStore } from './lib/store';

export default function App() {
  const mode = useStore((s) => s.mode);
  const onboarded = useStore((s) => s.onboarded);
  const init = useStore((s) => s.init);
  const enterDemo = useStore((s) => s.enterDemo);

  useEffect(() => {
    init();
    if (new URLSearchParams(window.location.search).has('demo')) enterDemo();
  }, [init, enterDemo]);

  if (mode === 'loading')
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
        <div className="label">Loading your plan…</div>
      </div>
    );
  if (mode === 'signedOut') return <Landing />;
  if (mode === 'cloud' && !onboarded) return <Onboarding />;
  return <Dashboard />;
}
