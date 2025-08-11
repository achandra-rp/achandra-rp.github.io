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
              <a href={resource.url} className="resource-link">
                <span className="resource-title">{resource.title}</span>
                <svg className="arrow-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"></path>
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