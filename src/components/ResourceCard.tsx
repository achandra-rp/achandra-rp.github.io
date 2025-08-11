import type { ResourceCategory } from '../data/resources';

interface ResourceCardProps {
  category: ResourceCategory;
}

const getCategoryIcon = (title: string) => {
  switch (title.toLowerCase()) {
    case 'keda & autoscaling':
      return '⚡';
    case 'kubernetes operations':
      return '☸️';
    case 'infrastructure monitoring':
      return '📊';
    case 'kafka integration':
      return '🔄';
    case 'scripts & tools':
      return '🛠️';
    default:
      return '📄';
  }
};

const ResourceCard = ({ category }: ResourceCardProps) => {
  const icon = getCategoryIcon(category.title);
  
  return (
    <div className="resource-category">
      <h3>
        <span className="category-icon">{icon}</span>
        {category.title}
      </h3>
      <ul className="resource-list">
        {category.resources.map((resource, index) => (
          <li key={index}>
            <div className="resource-item">
              <a href={resource.url} target="_blank" rel="noopener" className="resource-link">
                <span className="resource-title">{resource.title}</span>
                <svg className="external-link-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15,3 21,3 21,9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </a>
              <p className="resource-description">{resource.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ResourceCard;