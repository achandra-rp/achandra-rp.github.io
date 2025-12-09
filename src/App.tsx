import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import HeroSection from './components/HeroSection';
import ProjectsSection from './components/ProjectsSection';
import ResourcesSection from './components/ResourcesSection';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import K8sNodeDebug from './pages/K8sNodeDebug';
import KedaInstall from './pages/KedaInstall';
import Ec2PressureCheck from './pages/Ec2PressureCheck';
import KedaDrivenAutoscaling from './pages/KedaDrivenAutoscaling';
import KedaKnativeKafkaScaling from './pages/KedaKnativeKafkaScaling';
import AksAmpOidcConfig from './pages/AksAmpOidcConfig';
import KafkaKnativeAmpSetup from './pages/KafkaKnativeAmpSetup';
import TroubleshootingGrafana from './pages/TroubleshootingGrafana';
import BlackboxExporterSetup from './pages/BlackboxExporterSetup';
import VectorInstall from './pages/VectorInstall';
import KafkaCli from './pages/KafkaCli';
import NetToolsPod from './pages/NetToolsPod';
import './index.css';

function HomePage() {
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

function DocLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}

function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/docs/k8s-node-debug" element={<DocLayout><K8sNodeDebug /></DocLayout>} />
        <Route path="/docs/keda-install" element={<DocLayout><KedaInstall /></DocLayout>} />
        <Route path="/docs/ec2-pressure-check" element={<DocLayout><Ec2PressureCheck /></DocLayout>} />
        <Route path="/docs/keda-driven-autoscaling" element={<DocLayout><KedaDrivenAutoscaling /></DocLayout>} />
        <Route path="/docs/keda-knative-kafka-scaling" element={<DocLayout><KedaKnativeKafkaScaling /></DocLayout>} />
        <Route path="/docs/aks-amp-oidc-config" element={<DocLayout><AksAmpOidcConfig /></DocLayout>} />
        <Route path="/docs/kafka-knative-amp-setup" element={<DocLayout><KafkaKnativeAmpSetup /></DocLayout>} />
        <Route path="/docs/troubleshooting-grafana" element={<DocLayout><TroubleshootingGrafana /></DocLayout>} />
        <Route path="/docs/blackbox-exporter-setup" element={<DocLayout><BlackboxExporterSetup /></DocLayout>} />
        <Route path="/docs/vector-install" element={<DocLayout><VectorInstall /></DocLayout>} />
        <Route path="/docs/kafka-cli" element={<DocLayout><KafkaCli /></DocLayout>} />
        <Route path="/docs/net-tools-pod" element={<DocLayout><NetToolsPod /></DocLayout>} />
      </Routes>
    </>
  );
}

export default App;