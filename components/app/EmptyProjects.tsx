export default function EmptyProjects({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-hero">
      <div className="empty-box">
        <span className="empty-cubes">
          <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M25.36 30 L60 10 L94.64 30 L94.64 70 L60 90 L25.36 70 Z" />
            <path d="M60 50 L25.36 30 M60 50 L94.64 30 M60 50 L60 90" />
            <path className="cubes-grid" d="M42.68 20 L77.32 40 M77.32 20 L42.68 40 M42.68 40 L42.68 80 M77.32 40 L77.32 80 M25.36 50 L60 70 L94.64 50" />
          </svg>
        </span>
        <h2>Projects</h2>
        <p>
          Projects are larger units of work with a clear outcome — like a
          feature you want to ship. They group related tasks so you can plan and
          track progress in one place.
        </p>
        <div className="empty-actions">
          <button className="empty-create-btn" onClick={onCreate}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create New Project
          </button>
          <a
            className="empty-doc-btn"
            href="https://github.com/RababKhan/Task-Bucket"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </div>
    </div>
  );
}
