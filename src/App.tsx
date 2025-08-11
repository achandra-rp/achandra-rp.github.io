import { useEffect } from 'react';
import Header from './components/Header';
import ResourcesSection from './components/ResourcesSection';
import Footer from './components/Footer';
import './index.css';

function App() {
  // Hide loading message when React app mounts
  useEffect(() => {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.style.display = 'none';
    }
  }, []);

  return (
    <>
      <main>
        <Header />
        <ResourcesSection />
      </main>
      <Footer />
    </>
  );
}

export default App;