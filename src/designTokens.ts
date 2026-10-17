export const palettes = {
  light: [
    { name: "Background", value: "#F7F4EE", variable: "--color-background" },
    { name: "Surface / Card", value: "#FFFDF8", variable: "--color-surface" },
    { name: "Primary accent", value: "#E8621A", variable: "--color-primary" },
    { name: "Secondary accent", value: "#F2A65A", variable: "--color-secondary" },
    { name: "Text", value: "#191714", variable: "--color-text" },
    { name: "Muted text", value: "#6F6A62", variable: "--color-muted" },
    { name: "Success", value: "#2E7D5B", variable: "--color-success" },
    { name: "Warning", value: "#B86A12", variable: "--color-warning" },
    { name: "Error", value: "#C7463A", variable: "--color-error" },
  ],
  dark: [
    { name: "Background", value: "#11100E", variable: "--color-background" },
    { name: "Surface / Card", value: "#1C1A17", variable: "--color-surface" },
    { name: "Primary accent", value: "#F47A32", variable: "--color-primary" },
    { name: "Secondary accent", value: "#F2A65A", variable: "--color-secondary" },
    { name: "Text", value: "#F8F4EC", variable: "--color-text" },
    { name: "Muted text", value: "#AAA399", variable: "--color-muted" },
    { name: "Success", value: "#58B88A", variable: "--color-success" },
    { name: "Warning", value: "#F0A24A", variable: "--color-warning" },
    { name: "Error", value: "#F06A5F", variable: "--color-error" },
  ],
} as const;

export const typography = [
  { name: "Display / H1", family: "Fraunces", size: "40px", lineHeight: "48px", weight: "700", className: "type-display" },
  { name: "Heading / H2", family: "Fraunces", size: "28px", lineHeight: "34px", weight: "700", className: "type-heading" },
  { name: "Heading / H3", family: "Fraunces", size: "22px", lineHeight: "28px", weight: "600", className: "type-subheading" },
  { name: "Body / Large", family: "Outfit", size: "17px", lineHeight: "26px", weight: "400", className: "type-body-large" },
  { name: "Body", family: "Outfit", size: "15px", lineHeight: "23px", weight: "400", className: "type-body" },
  { name: "Caption", family: "Outfit", size: "12px", lineHeight: "18px", weight: "500", className: "type-caption" },
  { name: "Label", family: "Outfit", size: "13px", lineHeight: "16px", weight: "600", className: "type-label" },
  { name: "Chord / Timing", family: "SF Mono", size: "14px", lineHeight: "22px", weight: "500", className: "type-notation" },
] as const;
