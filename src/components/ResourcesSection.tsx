import ResourceCard from './ResourceCard';
import { resourceCategories } from '../data/resources';
import './ResourcesSection.css';

const ResourcesSection = () => {
  return (
    <section className="resources" id="resources">
      <h2>Technical Resources</h2>
      <p>A collection of guides, tools, and documentation for cloud-native infrastructure and Kubernetes operations.</p>
      
      <div className="resource-grid">
        {resourceCategories.map((category, index) => (
          <ResourceCard key={index} category={category} />
        ))}
      </div>
    </section>
  );
};

export default ResourcesSection;