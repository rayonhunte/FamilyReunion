export const FullscreenState = ({ title, description }: { title: string; description: string }) => (
  <main className="fullscreen-shell">
    <div className="state-card">
      <p className="eyebrow">Family Reunion Portal</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  </main>
);
