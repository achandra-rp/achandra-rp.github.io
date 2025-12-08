import Header from './components/Header';
import HeroSection from './components/HeroSection';
import ProjectsSection from './components/ProjectsSection';
import ResourcesSection from './components/ResourcesSection';
import Footer from './components/Footer';
import './index.css';

function App() {
  return (
    <>
      <Header />
      <main>
        <HeroSection />
        <ProjectsSection />
        <ResourcesSection />
      </main>
      <Footer />
    </>
  );
}

export default App;