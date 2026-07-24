import "@fontsource-variable/inter";
import "./globals.css";

export const metadata = {
  title: "Tavernary",
  description: "Where AI roleplay tools gather",
  icons: {
    icon: [
      { url: "./favicon.ico", sizes: "32x32" },
      { url: "./tavernary-favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "./tavernary-favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
