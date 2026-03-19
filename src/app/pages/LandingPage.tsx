import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export const LandingPage = () => {
  const { profile, signInWithGoogle, error, isDemoMode } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (profile?.status === 'pending') {
      navigate('/pending', { replace: true });
    }
  }, [navigate, profile]);

  return (
    <main className="landing-page hk-landing-page">
      <section className="hk-landing-frame">
        <header className="hk-landing-topbar">
          <h1 className="hk-brand-mark">Heritage Hearth</h1>
          <nav className="hk-top-links" aria-label="Landing navigation">
            <a href="#home">Home</a>
            <a href="#events">Events</a>
            <a href="#gallery">Gallery</a>
          </nav>
          <div className="hk-top-icons" aria-hidden="true">
            <span>•</span>
            <span>•</span>
            <span className="hk-avatar-dot">◉</span>
          </div>
        </header>

        <section className="hk-landing-grid" id="home">
          <aside className="hk-left-rail">
            <div className="hk-left-head">
              <p className="hk-reunion-year">Reunion 2024</p>
              <p className="hk-family-name">The Miller Family</p>
            </div>

            <nav className="hk-side-nav" aria-label="Preview sections">
              <a href="#home" className="is-active">Dashboard</a>
              <a href="#events">Events</a>
              <a href="#gallery">Gallery</a>
              <a href="#directory">Directory</a>
            </nav>

            <button className="hk-side-cta" onClick={() => void signInWithGoogle()}>
              Add Memory
            </button>

            <div className="hk-side-foot">
              <span>Support</span>
              <span>Archive</span>
            </div>
          </aside>

          <div className="hk-main-panel">
            <section className="hk-hero" aria-label="Welcome section">
              <div className="hk-hero-overlay">
                <h2>Welcome home, family</h2>
                <p>
                  The Miller Family Reunion 2024 is more than a date on the calendar. It is a return to the hearth.
                </p>
                <div className="hk-hero-actions">
                  <button className="hk-primary-btn" onClick={() => void signInWithGoogle()}>
                    {isDemoMode ? 'Open Demo Portal' : 'Login or Request Access'}
                  </button>
                  <a className="hk-secondary-btn" href="#highlight">Explore Public History</a>
                </div>
              </div>
            </section>

            <section className="hk-feature-grid" id="events">
              <article className="hk-feature-card hk-feature-rsvp">
                <p className="hk-feature-eyebrow">Plan Ahead</p>
                <h3>RSVP for Events</h3>
                <p>From fish fry to Sunday blessing, secure your place and keep the weekend coordinated.</p>
                <button className="hk-inline-btn" onClick={() => void signInWithGoogle()}>View Schedule</button>
              </article>

              <article className="hk-feature-card hk-feature-gallery" id="gallery">
                <h3>Family Gallery</h3>
                <p>450+ memories from previous reunions, organized by year and contributor.</p>
                <a href="#highlight">Explore Memories</a>
              </article>

              <article className="hk-feature-card hk-feature-small" id="directory">
                <h3>Hotel and Lodging</h3>
                <p>Group rates and arrival windows in one place for the full family.</p>
              </article>

              <article className="hk-feature-card hk-feature-small">
                <h3>Family Directory</h3>
                <p>Find cousins, uncles, and new additions before reunion weekend begins.</p>
              </article>
            </section>

            <section className="hk-highlight" id="highlight">
              <h3>Last Year's Highlight</h3>
              <article className="hk-highlight-card">
                <img src="/family_hero.png" alt="Family reunion memory highlight" />
                <div>
                  <p className="hk-highlight-meta">Summer 2023 Retrospective</p>
                  <h4>The Great Picnic at Miller&apos;s Creek</h4>
                  <p>
                    Captured during the sunset toast, this moment defines what it means to be a Miller: surrounded by
                    laughter, good food, and generations of stories.
                  </p>
                </div>
              </article>
            </section>
          </div>
        </section>

        {error ? <p className="inline-error">{error}</p> : null}
      </section>
    </main>
  );
};
