import type { ReactNode } from 'react';
import './DocPage.css';

interface DocPageProps {
  title: string;
  children: ReactNode;
}

const DocPage = ({ title, children }: DocPageProps) => {
  return (
    <div className="doc-page">
      <div className="doc-container">
        <header className="doc-header">
          <a href="/#resources" className="doc-back-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Resources
          </a>
          <h1 className="doc-title">{title}</h1>
        </header>
        <article className="doc-content">
          {children}
        </article>
      </div>
    </div>
  );
};

export default DocPage;
