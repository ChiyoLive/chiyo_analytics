import { useState, useEffect } from "react";
import { Link } from "react-router";

export default function Home() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    document.title = "Home | Chiyo Store";

    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4rem" }}>
      {/* Hero Section */}
      <section className="hero-section">
        <h1 className="hero-title">Next-Gen CSR Analytics Example</h1>
        <p className="hero-description">
          Welcome to the <strong>Chiyo Gadget Store</strong>. This is a
          real-world multi-page application utilizing{" "}
          <strong>React Router v7 Data Mode</strong> and <strong>Vite</strong>{" "}
          to showcase our lightweight client-side analytics SDK.
        </p>

        {/* Live Stay Counter */}
        <div className="timer-badge">
          <span className="timer-pulse" />
          <span>
            You have been on this page for:{" "}
            <strong style={{ fontSize: "1.1rem" }}>{seconds}s</strong>
          </span>
        </div>

        <div style={{ paddingTop: "1rem" }}>
          <Link to="/products" className="cta-button">
            Explore catalog &rarr;
          </Link>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="feature-grid">
        <div className="feature-card">
          <div className="feature-icon">⏱️</div>
          <h3 className="feature-title">Duration Tracking</h3>
          <p className="feature-desc">
            The SDK tracks active stay duration accurately. If you spend less
            than 1 second on a page, it is ignored to keep metrics clean.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🧭</div>
          <h3 className="feature-title">Client Routing (CSR)</h3>
          <p className="feature-desc">
            Unlike static pages, routing here happens inside React Router. We
            hook into location changes to report views dynamically.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🗃️</div>
          <h3 className="feature-title">Session Durability</h3>
          <p className="feature-desc">
            Visitor and Session identifiers are automatically stored inside
            `localStorage` and `sessionStorage` to trace persistent journeys.
          </p>
        </div>
      </section>

      {/* Integration Guide Section */}
      <section className="info-section">
        <h2 className="info-title">How it works</h2>
        <p className="info-text">
          When navigating using the navbar or catalog links, the URL changes
          client-side. The `RootLayout` triggers the SDK:
        </p>
        <pre className="code-block">
          {`// RootLayout.tsx
useEffect(() => {
  trackPageView();
}, [location]);`}
        </pre>
        <p className="info-text" style={{ marginTop: "1rem", marginBottom: 0 }}>
          This sends a beacon payload containing the previous page duration, UTM
          tags, user agent details, and coordinates to the Go ingestion
          endpoint. Check the live ingest console below to see events fly in
          real time!
        </p>
      </section>
    </div>
  );
}
