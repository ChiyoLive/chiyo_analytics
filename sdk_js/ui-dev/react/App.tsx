import "../../dist/ui/index.css";
import { ui } from "../../dist/spa";
import { useEffect, useState } from "react";

export function App() {
  const [colorMode, setColorMode] = useState<"dark" | "light">("light");

  const setHtmlLang = (lang: string) => {
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    ui.banner.render();
  }, []);

  useEffect(() => {
    if (colorMode === "dark") {
      document.documentElement.style = "color-scheme: dark;";
    } else {
      document.documentElement.style = "color-scheme: light;";
    }
  }, [colorMode]);

  return (
    <div>
      <div style={{ marginBottom: "8px" }}>
        DEV ONLY | Chiyo Analytics Privacy Banner | React
      </div>
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        <span>Toggle Color Mode</span>
        <button
          onClick={() => {
            setColorMode(colorMode === "dark" ? "light" : "dark");
          }}
        >
          {colorMode}
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: "8px",
        }}
      >
        <span>Change lang:</span>
        <button onClick={() => setHtmlLang("en")}>en</button>
        <button onClick={() => setHtmlLang("zh")}>zh</button>
        <button onClick={() => setHtmlLang("ja")}>ja</button>
      </div>
    </div>
  );
}
