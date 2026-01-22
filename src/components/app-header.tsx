import { AppLogo } from '@/components/icons';

export default function AppHeader() {
  return (
    <header className="py-6 px-4 md:px-6">
      <div className="container mx-auto flex items-center gap-3">
        <AppLogo className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Production Extractor
        </h1>
      </div>
    </header>
  );
}
