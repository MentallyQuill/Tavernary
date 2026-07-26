import "@fontsource-variable/inter";
import "./globals.css";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const projectPage =
  process.env.GITHUB_ACTIONS === "true" &&
  repositoryName.length > 0 &&
  !repositoryName.endsWith(".github.io");
const basePath =
  process.env.TAVERNARY_BASE_PATH ?? (projectPage ? `/${repositoryName}` : "");
const assetPath = (path: string) => `${basePath}/${path}`;

export const metadata = {
  title: "Tavernary",
  description: "Where AI roleplay tools gather",
  icons: {
    icon: [
      { url: assetPath("favicon.ico"), sizes: "16x16 32x32" },
      {
        url: assetPath("tavernary-favicon-32.png"),
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: assetPath("tavernary-favicon-16.png"),
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: assetPath("tavernary-favicon-192.png"),
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: assetPath("tavernary-favicon-512.png"),
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: assetPath("apple-touch-icon.png"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={{ backgroundColor: "#07181d" }}>
      <head>
        <meta name="darkreader-lock" />
      </head>
      <body>{children}</body>
    </html>
  );
}
