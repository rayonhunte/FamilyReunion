import type { ReactNode } from 'react';

export const Card = ({
  children,
  accent,
  className = '',
}: {
  children: ReactNode;
  accent?: 'warm' | 'cool';
  className?: string;
}) => <section className={`panel-card ${accent ? `accent-${accent}` : ''} ${className}`.trim()}>{children}</section>;

export const SectionHeader = ({ title, meta }: { title: string; meta?: string }) => (
  <header className="section-header">
    <h2>{title}</h2>
    {meta ? <span>{meta}</span> : null}
  </header>
);

export const SectionIntro = ({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) => (
  <header className="section-intro">
    <p className="eyebrow">{eyebrow}</p>
    <h1>{title}</h1>
    <p>{body}</p>
  </header>
);

export const StatCard = ({ title, value, detail }: { title: string; value: string; detail: string }) => (
  <article className="stat-card">
    <span>{title}</span>
    <strong>{value}</strong>
    <p>{detail}</p>
  </article>
);
