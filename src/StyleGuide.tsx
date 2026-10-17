import { palettes, typography } from "./designTokens";

function GuideIcon({ name }: { name: "library" | "add" | "settings" }) {
  if (name === "library") {
    return <svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20" /></svg>;
  }
  if (name === "add") {
    return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>;
  }
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.96 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 10 3.02V3h4v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 20.96 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></svg>;
}

function Palette({ mode }: { mode: "light" | "dark" }) {
  return (
    <article className={`palette-card palette-${mode}`}>
      <div className="palette-heading">
        <div>
          <span className="guide-kicker">{mode} mode</span>
          <h3>{mode === "light" ? "Warm daylight" : "Dark stage"}</h3>
        </div>
        <span className="mode-chip">{mode}</span>
      </div>
      <div className="swatch-grid">
        {palettes[mode].map((color) => (
          <div className="swatch" key={color.name}>
            <span className={`swatch-color swatch-${color.variable.replace("--color-", "")}`} />
            <span>
              <strong>{color.name}</strong>
              <code>{color.value}</code>
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function StyleGuide() {
  return (
    <main className="style-guide">
      <header className="guide-hero">
        <div>
          <span className="guide-kicker">Amphion design system · v1.0</span>
          <h1>Warm, focused, and easy to play.</h1>
          <p>The permanent visual reference for every Amphion screen. Orange carries action and encouragement; warm neutrals keep the experience calm and musical.</p>
        </div>
        <div className="guide-principles">
          <span>Approachable</span>
          <span>Clear</span>
          <span>Musical</span>
        </div>
      </header>

      <section className="guide-section">
        <div className="section-heading">
          <span>01</span>
          <div><h2>Color</h2><p>Use semantic colors consistently. Orange is reserved for primary actions, progress, and active states.</p></div>
        </div>
        <div className="palette-layout">
          <Palette mode="light" />
          <Palette mode="dark" />
        </div>
      </section>

      <section className="guide-section">
        <div className="section-heading">
          <span>02</span>
          <div><h2>Typography</h2><p>Fraunces adds warmth to key moments. Outfit keeps controls and learning content highly legible. SF Mono is reserved for chord changes and timing.</p></div>
        </div>
        <div className="type-table">
          {typography.map((type) => (
            <div className="type-row" key={type.name}>
              <div className={type.className}>{type.name === "Chord / Timing" ? "00:24  Am7 → F" : "Learn it by ear."}</div>
              <div className="type-meta">
                <strong>{type.name}</strong>
                <span>{type.family} · {type.size}/{type.lineHeight} · {type.weight}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="guide-section">
        <div className="section-heading">
          <span>03</span>
          <div><h2>Buttons</h2><p>Controls use a 48px minimum touch target, clear labels, and restrained feedback. Use one primary action per view.</p></div>
        </div>
        <div className="component-panel button-showcase">
          <button className="button button-primary" type="button">Primary action</button>
          <button className="button button-secondary" type="button">Secondary action</button>
          <button className="button button-tertiary" type="button">Tertiary action</button>
          <button className="button button-primary" type="button" disabled>Disabled</button>
        </div>
        <p className="component-note">Radius: 12px · Height: 48px · Label: Outfit 15/600 · Primary uses solid orange, never a gradient.</p>
      </section>

      <section className="guide-section">
        <div className="section-heading">
          <span>04</span>
          <div><h2>Cards</h2><p>Cards group related information without adding visual noise. Keep borders subtle and elevation soft.</p></div>
        </div>
        <div className="card-showcase">
          <article className="sample-card">
            <span className="card-label">Standard</span>
            <h3>Song information</h3>
            <p>For grouped content and forms. Use the surface color, 16px radius, and a 1px border.</p>
          </article>
          <article className="sample-card card-interactive">
            <span className="card-label">Interactive</span>
            <h3>Ready to play</h3>
            <p>Use restrained elevation and an orange focus ring for tappable cards.</p>
          </article>
          <article className="sample-card card-notation">
            <span className="card-label">Notation</span>
            <code>Am7&nbsp;&nbsp;&nbsp;&nbsp;F&nbsp;&nbsp;&nbsp;&nbsp;C&nbsp;&nbsp;&nbsp;&nbsp;G</code>
            <p>Notation surfaces use warm inset contrast and monospaced text.</p>
          </article>
        </div>
      </section>

      <section className="guide-section">
        <div className="section-heading">
          <span>05</span>
          <div><h2>Icons</h2><p>Use simple outlined symbols with rounded corners. Filled icons are reserved for selected navigation states.</p></div>
        </div>
        <div className="component-panel icon-showcase">
          <div><span className="guide-icon"><GuideIcon name="library" /></span><strong>Library</strong></div>
          <div><span className="guide-icon icon-active"><GuideIcon name="add" /></span><strong>Add song</strong></div>
          <div><span className="guide-icon"><GuideIcon name="settings" /></span><strong>Settings</strong></div>
          <p>20px standard / 24px navigation · 1.75px stroke · round caps and joins · no decorative icon shadows</p>
        </div>
      </section>
    </main>
  );
}
