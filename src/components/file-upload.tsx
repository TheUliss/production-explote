'use client';

import { AlertCircle, UploadCloud } from 'lucide-react';
import * as React from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert, AlertDescription } from './ui/alert';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function FileUpload({ onFileSelect }: FileUploadProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const validateAndSelectFile = (file: File) => {
    setError(null);

    // Validate file type
    const validTypes = ['.xlsx', '.xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    const isValidType = validTypes.some(type =>
      file.name.endsWith(type) || file.type === type
    );

    if (!isValidType) {
      setError('Tipo de archivo no válido. Por favor sube un archivo .xlsx o .xls');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`El archivo excede el límite de ${MAX_FILE_SIZE_MB}MB. Por favor sube un archivo más pequeño.`);
      return;
    }

    onFileSelect(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSelectFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSelectFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-center h-full gap-4">
      {error && (
        <Alert variant="destructive" className="w-full">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div
        className={`w-full p-4 md:p-8 border-2 border-dashed rounded-lg text-center transition-colors duration-200 cursor-pointer ${isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary'}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud className="mx-auto h-12 w-12 md:h-16 md:w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Sube tu archivo Excel</h2>
        <p className="text-muted-foreground mb-2">Arrastra y suelta tu archivo .xlsx o .xls aquí, o haz clic para buscar.</p>
        <p className="text-sm text-muted-foreground mb-6">Tamaño máximo: {MAX_FILE_SIZE_MB}MB</p>
        <Button variant="outline" size="lg" className="pointer-events-none">
          Seleccionar Archivo
        </Button>
        <Input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".xlsx, .xls"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
