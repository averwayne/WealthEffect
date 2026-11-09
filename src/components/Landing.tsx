import { useState } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export function AuthForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');
  const redirectTo = window.location.origin + window.location.pathname;

  const send = async () => {
    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
    if (error) {
      setErr(error.message);
      setState('error');
    } else setState('sent');
  };

  if (state === 'sent')
    return (
      <div className="authbox">
        <div className="label">Check your inbox</div>
        <p style={{ margin: 0, fontSize: 15 }}>
          We sent a sign-in link to <b>{email}</b>. Open it on this device to continue.
        </p>
        <button className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => setState('idle')}>
          Use a different email
        </button>
      </div>
    );

  return (
    <form
      className="authbox"
      onSubmit={(e) => {
        e.preventDefault();
        if (/\S+@\S+\.\S+/.test(email)) void send();
      }}
    >
      <label className="label" htmlFor="email">
        Email
      </label>
      <input id="email" className="textin" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <button className="btn" type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Continue with email'}
      </button>
      <div className="divider">or</div>
      <button
        className="btn ghost"
        type="button"
        onClick={async () => {
          const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
          if (error) {
            setErr(error.message);
            setState('error');
          }
        }}
      >
        Continue with Google
      </button>
      {state === 'error' && <p className="note neg">{err}</p>}
      <p className="note" style={{ margin: 0 }}>
        No password needed. Your plan is private to your account.
      </p>
    </form>
  );
}

export function Landing() {
  const enterDemo = useStore((s) => s.enterDemo);
  return (
    <div className="landing">
      <div className="bezel">
      <div className="device" style={{ gridTemplateRows: 'auto 1fr auto auto' }}>
      <header className="masthead" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <span className="label">Personal wealth planning</span>
        <div className="brand">Wealth Effect</div>
        <span />
      </header>
      <div className="landing-grid">
        <div>
          <div><span className="tag y">Plan</span> <span className="tag g">Invest</span> <span className="tag w">Track</span></div>
          <h1>One page for the decades it takes to build wealth.</h1>
          <p className="lede">
            Set a goal, choose an allocation grounded in a century of market history, and measure every month against a fixed target path, with live prices,
            simulated outcomes and your standing against Federal Reserve data.
          </p>
          <div style={{ marginTop: 28, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="btn ghost" onClick={enterDemo}>
              Explore with sample data
            </button>
            <span className="note">No account required</span>
          </div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 14 }}>
            Sign in or create an account
          </div>
          <AuthForm />
        </div>
      </div>
      <div className="features">
        <div>
          <h5>
            <span className="wine">01</span>&nbsp;&nbsp;Cash flow
          </h5>
          <p>What you earn, what you spend and what you invest each month, with a savings rate that compounds alongside your raises.</p>
        </div>
        <div>
          <h5>
            <span className="wine">02</span>&nbsp;&nbsp;Projection
          </h5>
          <p>Solve for any variable, then see the realistic range: 5,000 simulated market paths and your probability of reaching the goal.</p>
        </div>
        <div>
          <h5>
            <span className="wine">03</span>&nbsp;&nbsp;Performance
          </h5>
          <p>Contributions separated from market gains, a money-weighted personal return, and the S&amp;P 500 on the same cash flows.</p>
        </div>
        <div>
          <h5>
            <span className="wine">04</span>&nbsp;&nbsp;Standing
          </h5>
          <p>Your net worth percentile for your age from the Federal Reserve’s 2025 Survey of Consumer Finances, and the year you reach the next tier.</p>
        </div>
      </div>
      <footer className="foot">
        <span>For education and planning only. Not investment advice.</span>
        <span>© {new Date().getFullYear()} Wealth Effect</span>
      </footer>
      </div>
      </div>
    </div>
  );
}
