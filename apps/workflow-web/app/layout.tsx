import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { LayoutClient } from './layout-client';

export const metadata: Metadata = {
  title: 'Workflow Dashboard',
  description: 'Monitor and debug your durable workflows',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen bg-background font-sans antialiased`}>
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}
