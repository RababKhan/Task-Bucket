export default function EmptyProjects({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-hero">
      <div className="empty-hero-art">
        <span className="empty-art-badge">
          <svg className="empty-art-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path className="layer-1" d="M12 3 2 8l10 5 10-5-10-5Z" />
            <path d="M2 13l10 5 10-5" />
            <path d="M2 18l10 5 10-5" />
          </svg>
        </span>
      </div>
      <h2>Create your first project</h2>
      <p>
        Before you can add tasks, you&apos;ll need a project for your workspace.
        Create one to get started.
      </p>
      <button className="empty-create-btn" onClick={onCreate}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Create New Project
      </button>
    </div>
  );
}
