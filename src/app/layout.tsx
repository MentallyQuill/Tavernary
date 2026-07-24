import "@fontsource-variable/inter";
import "./globals.css";

export const metadata = {
  title: "Tavernary",
  description: "Where AI roleplay tools gather",
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
