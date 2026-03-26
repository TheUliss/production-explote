import { AppLogo } from '@/components/icons';

export default function AppHeader() {
  return (
    <header className="py-3 md:py-6 px-4 md:px-6">
      <div className="container mx-auto flex items-center gap-3">
        <AppLogo className="h-6 w-6 md:h-7 md:w-7 text-primary" />
        <h1 className="text-lg md:text-2xl font-semibold tracking-tight text-foreground">
          Production Extractor
        </h1>
      </div>
    </header>
  );
}
