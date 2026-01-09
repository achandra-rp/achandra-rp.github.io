import { useEffect, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import mermaid from 'mermaid';

interface MermaidProps {
  chart: string;
  className?: string;
}

const Mermaid = ({ chart, className = '' }: MermaidProps) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Initialize mermaid with custom theme
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#61afef',
        primaryTextColor: '#d7dae0',
        primaryBorderColor: '#323842',
        lineColor: '#5c6370',
        secondaryColor: '#282c34',
        tertiaryColor: '#21252b',
        background: '#1a1d23',
        mainBkg: '#21252b',
        secondBkg: '#282c34',
        border1: '#323842',
        border2: '#3e4451',
        note: '#282c34',
        noteBkgColor: '#282c34',
        noteBorderColor: '#323842',
        noteTextColor: '#abb2bf',
        fontSize: '14px',
        fontFamily: 'IBM Plex Sans, sans-serif',
      },
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
      },
      securityLevel: 'loose',
    });

    const renderDiagram = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        setSvg(svg);
        setError('');
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error rendering diagram');
      }
    };

    renderDiagram();
  }, [chart]);

  if (error) {
    return (
      <div className={`mermaid-container ${className}`}>
        <pre style={{ color: '#e06c75', padding: '1rem' }}>
          Error rendering diagram: {error}
        </pre>
      </div>
    );
  }

  return (
    <div className={`mermaid-container ${className}`}>
      <div className="mermaid-controls">
        <span className="mermaid-hint">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
          </svg>
          Scroll to zoom • Drag to pan • Double-click to reset
        </span>
      </div>
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={3}
        centerOnInit
        wheel={{ step: 0.1 }}
        doubleClick={{ mode: 'reset' }}
        panning={{ velocityDisabled: true }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="mermaid-zoom-controls">
              <button onClick={() => zoomIn()} className="mermaid-zoom-btn" title="Zoom in">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
                </svg>
              </button>
              <button onClick={() => zoomOut()} className="mermaid-zoom-btn" title="Zoom out">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35M8 11h6"/>
                </svg>
              </button>
              <button onClick={() => resetTransform()} className="mermaid-zoom-btn" title="Reset zoom">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                </svg>
              </button>
            </div>
            <TransformComponent
              wrapperStyle={{
                width: '100%',
                height: '500px',
              }}
              contentStyle={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div ref={elementRef} dangerouslySetInnerHTML={{ __html: svg }} />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
};

export default Mermaid;
