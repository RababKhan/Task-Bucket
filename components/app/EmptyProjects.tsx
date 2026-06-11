export default function EmptyProjects({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-hero">
      <div className="empty-hero-art">
        <svg viewBox="0 0 120 120" fill="none" aria-hidden>
          <rect x="30" y="26" width="60" height="70" rx="12" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="2" />
          <rect x="49" y="18" width="22" height="12" rx="4" fill="var(--border)" />
          <circle cx="48" cy="56" r="4" fill="var(--text-dim)" />
          <circle cx="72" cy="56" r="4" fill="var(--text-dim)" />
          <path d="M47 70c3.5 4 9 6 13 6s9.5-2 13-6" stroke="var(--text-dim)" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M97 32l2.6 5.4 5.4 2.6-5.4 2.6L97 48l-2.6-5.4L89 40l5.4-2.6z" fill="var(--accent)" opacity="0.55" />
          <circle cx="22" cy="50" r="3" fill="var(--accent)" opacity="0.4" />
          <circle cx="100" cy="80" r="2.4" fill="var(--accent)" opacity="0.35" />
        </svg>
      </div>
      <h2>Create your first project</h2>
      <p>
        Before you can add tasks, you&apos;ll need a project for your workspace.
        Create one to get started.
      </p>
      <button className="btn btn-primary" onClick={onCreate}>
        + Create New Project
      </button>
    </div>
  );
}
