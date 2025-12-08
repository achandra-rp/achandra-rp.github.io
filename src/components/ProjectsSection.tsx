import { useState } from 'react';
import { GitHub, ExternalLink, Terminal, Code, Brain } from './icons';
import './ProjectsSection.css';

interface Project {
  id: string;
  title: string;
  description: string;
  longDescription: string;
  tech: string[];
  icon: React.ReactNode;
  github: string;
  demo?: string;
  category: 'infrastructure' | 'development' | 'ai';
  featured: boolean;
}

const projects: Project[] = [
  {
    id: 'awsutil',
    title: 'AWSUtil',
    description: 'Enterprise AWS SSO & EKS management utility',
    longDescription: 'A comprehensive Bash utility for managing AWS SSO authentication, EKS cluster access, and service port forwarding through AWS Systems Manager (SSM). Handles concurrent service forwarding, SSH access, and session management in production environments.',
    tech: ['Bash', 'AWS CLI', 'kubectl', 'SSM', 'yq'],
    icon: <Terminal />,
    github: 'https://github.com/radpartners/awsutil',
    category: 'infrastructure',
    featured: true
  },
  {
    id: 'py-awsutil',
    title: 'py-awsutil',
    description: 'Python AWS utility with enhanced features',
    longDescription: 'Python-based AWS utility for managing EKS/EC2 connections via SSM. 100% compatible with the original bash version but enhanced with comprehensive test coverage, shell completion, and advanced process management.',
    tech: ['Python', 'AWS CLI', 'kubectl', 'psutil', 'PyYAML'],
    icon: <Code />,
    github: 'https://github.com/achandra-rp/py-awsutil',
    category: 'development',
    featured: true
  },
  {
    id: 'promptheus',
    title: 'Promptheus',
    description: 'AI-powered prompt engineering CLI',
    longDescription: 'An intelligent prompt refinement tool that uses adaptive questioning to optimize prompts for Large Language Models. Supports multiple AI providers and includes both CLI and web interfaces with session tracking.',
    tech: ['Python', 'Flask', 'MCP', 'Poetry', 'AI/ML'],
    icon: <Brain />,
    github: 'https://github.com/abhichandra21/Promptheus',
    category: 'ai',
    featured: true
  }
];

const ProjectsSection = () => {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);

  const filteredProjects = activeFilter === 'all'
    ? projects
    : projects.filter(p => p.category === activeFilter);

  return (
    <section className="projects-section" id="projects">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">
            <span className="section-number">02.</span>
            Featured Projects
          </h2>
          <p className="section-description">
            A selection of tools and applications I've built to solve real-world problems
          </p>
        </div>

        <div className="filter-tabs">
          <button
            className={`filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All Projects
          </button>
          <button
            className={`filter-tab ${activeFilter === 'infrastructure' ? 'active' : ''}`}
            onClick={() => setActiveFilter('infrastructure')}
          >
            Infrastructure
          </button>
          <button
            className={`filter-tab ${activeFilter === 'development' ? 'active' : ''}`}
            onClick={() => setActiveFilter('development')}
          >
            Development
          </button>
          <button
            className={`filter-tab ${activeFilter === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ai')}
          >
            AI/ML
          </button>
        </div>

        <div className="projects-grid">
          {filteredProjects.map((project, index) => (
            <div
              key={project.id}
              className={`project-card ${hoveredProject === project.id ? 'hovered' : ''}`}
              onMouseEnter={() => setHoveredProject(project.id)}
              onMouseLeave={() => setHoveredProject(null)}
              style={{
                animationDelay: `${index * 0.1}s`
              }}
            >
              <div className="project-content">
                <div className="project-header">
                  <div className="project-icon">
                    {project.icon}
                  </div>
                  <div className="project-links">
                    <a
                      href={project.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="project-link"
                      aria-label={`View ${project.title} on GitHub`}
                    >
                      <GitHub />
                    </a>
                    {project.demo && (
                      <a
                        href={project.demo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="project-link"
                        aria-label={`View ${project.title} demo`}
                      >
                        <ExternalLink />
                      </a>
                    )}
                  </div>
                </div>

                <h3 className="project-title">
                  {project.title}
                </h3>

                <p className="project-description">
                  {hoveredProject === project.id ? project.longDescription : project.description}
                </p>

                <div className="project-tech">
                  {project.tech.map((tech) => (
                    <span key={tech} className="tech-tag">
                      {tech}
                    </span>
                  ))}
                </div>

                <div className="project-category">
                  <span className={`category-badge ${project.category}`}>
                    {project.category === 'infrastructure' && 'Infrastructure'}
                    {project.category === 'development' && 'Development'}
                    {project.category === 'ai' && 'AI/ML'}
                  </span>
                </div>
              </div>

              <div className="project-glow"></div>
            </div>
          ))}
        </div>

        <div className="projects-cta">
          <p>Interested in collaborating or learning more?</p>
          <a href="#contact" className="cta-button">
            Get In Touch
            <span className="cta-arrow">→</span>
          </a>
        </div>
      </div>
    </section>
  );
};

export default ProjectsSection;