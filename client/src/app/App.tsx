import { useEffect } from "react";
import MapCanvas from "../components/MapCanvas";
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

        const data = await response.json();
      } catch (err) {}
    };

    checkHealth();
  }, []);

  return (
    <main className="app">
      <header className="toolbar">
        <h1>3D Map Engine</h1>
        <span>WebGL2</span>
      </header>

      <section className="map-container">
        {/* <MapCanvas /> */}
        <GlobeCanvas />
      </section>
    </main>
  );
}

export default App;
