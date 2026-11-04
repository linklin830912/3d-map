import { useEffect } from "react";
import "../styles/global.css";
import GlobeCanvas from "../components/globe/GlobeCanvas";

function App() {
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch("/api/health");

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        await response.json();
      } catch {
        // Health check is best-effort during local dev.
      }
    };

    void checkHealth();
  }, []);

  return (
    <main className="app">
      <header className="toolbar">
        <h1>3D Map Engine</h1>
        <span>WebGL2</span>
      </header>

      <section className="map-container">
        <GlobeCanvas />
      </section>
    </main>
  );
}

export default App;
