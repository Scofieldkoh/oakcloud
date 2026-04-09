'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Undo2 } from 'lucide-react';

interface SignaturePoint {
  x: number;
  y: number;
  pressure: number;
}

type SignatureStroke = SignaturePoint[];

interface SignaturePadProps {
  value?: string;
  onChange: (dataUrl: string) => void;
  onVectorChange?: (dataUrl: string | null) => void;
  ariaLabel?: string;
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function buildSvgDataUrl(
  strokes: SignatureStroke[],
  width: number,
  height: number
): string | null {
  if (strokes.length === 0) {
    return null;
  }

  const paths = strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) => {
      const path = stroke
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(' ');
      const pressure = stroke.reduce((sum, point) => sum + point.pressure, 0) / stroke.length;
      const strokeWidth = Math.max(1.5, Math.min(3.5, 1.5 + pressure * 2));

      return `<path d="${path}" fill="none" stroke="#111111" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth.toFixed(2)}" />`;
    })
    .join('');

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    '<rect width="100%" height="100%" fill="white" fill-opacity="0" />',
    paths,
    '</svg>',
  ].join('');

  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

export function SignaturePad({
  value,
  onChange,
  onVectorChange,
  ariaLabel = 'Signature field',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<SignatureStroke>([]);
  const strokesRef = useRef<SignatureStroke[]>([]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const getCanvasContext = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    return canvas && context ? { canvas, context } : null;
  }, []);

  const configureCanvas = useCallback(() => {
    const result = getCanvasContext();
    if (!result) {
      return null;
    }

    const { canvas, context } = result;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(scale, scale);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#111111';
    context.lineWidth = 2;
    setCanvasSize({ width: rect.width, height: rect.height });

    return { canvas, context, rect };
  }, [getCanvasContext]);

  const redrawCanvas = useCallback((backgroundDataUrl?: string) => {
    const configured = configureCanvas();
    if (!configured) {
      return;
    }

    const { context, rect } = configured;
    context.clearRect(0, 0, rect.width, rect.height);

    if (backgroundDataUrl) {
      const image = new Image();
      image.onload = () => {
        context.clearRect(0, 0, rect.width, rect.height);
        context.drawImage(image, 0, 0, rect.width, rect.height);
      };
      image.src = backgroundDataUrl;
      return;
    }

    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) {
        continue;
      }

      context.beginPath();
      context.lineWidth = Math.max(
        1.5,
        Math.min(
          3.5,
          1.5 + stroke.reduce((sum, point) => sum + point.pressure, 0) / stroke.length * 2
        )
      );
      context.moveTo(stroke[0].x, stroke[0].y);
      for (const point of stroke.slice(1)) {
        context.lineTo(point.x, point.y);
      }
      context.stroke();
    }
  }, [configureCanvas]);

  const emitChanges = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const pngDataUrl = strokesRef.current.length > 0 ? canvas.toDataURL('image/png') : '';
    onChange(pngDataUrl);
    onVectorChange?.(buildSvgDataUrl(strokesRef.current, canvasSize.width, canvasSize.height));
    setHasDrawn(strokesRef.current.length > 0);
  }, [canvasSize.height, canvasSize.width, onChange, onVectorChange]);

  useEffect(() => {
    const configured = configureCanvas();
    if (!configured) {
      return;
    }

    if (!value) {
      strokesRef.current = [];
      currentStrokeRef.current = [];
      setHasDrawn(false);
      onVectorChange?.(null);
      return;
    }

    const { context, rect } = configured;
    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, rect.width, rect.height);
      context.drawImage(image, 0, 0, rect.width, rect.height);
      setHasDrawn(true);
    };
    image.src = value;
  }, [configureCanvas, onVectorChange, value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const observer = new ResizeObserver(() => {
      redrawCanvas(strokesRef.current.length === 0 ? value : undefined);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redrawCanvas, value]);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>): SignaturePoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pressure > 0 ? event.pressure : event.pointerType === 'mouse' ? 0.5 : 0.8,
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const result = getCanvasContext();
    if (!result) {
      return;
    }

    const { canvas, context } = result;
    if (strokesRef.current.length === 0 && value) {
      strokesRef.current = [];
      currentStrokeRef.current = [];
      context.clearRect(0, 0, canvas.width, canvas.height);
      onVectorChange?.(null);
    }

    const point = getPoint(event);
    currentStrokeRef.current = [point];
    isDrawingRef.current = true;
    context.beginPath();
    context.lineWidth = Math.max(1.5, Math.min(3.5, 1.5 + point.pressure * 2));
    context.moveTo(point.x, point.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    canvas.setPointerCapture(event.pointerId);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    const result = getCanvasContext();
    if (!result || !isDrawingRef.current) {
      return;
    }

    const { context } = result;
    const point = getPoint(event);
    currentStrokeRef.current.push(point);
    context.lineWidth = Math.max(1.5, Math.min(3.5, 1.5 + point.pressure * 2));
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !isDrawingRef.current) {
      return;
    }

    isDrawingRef.current = false;
    canvas.releasePointerCapture(event.pointerId);

    if (currentStrokeRef.current.length > 0) {
      strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
      currentStrokeRef.current = [];
      emitChanges();
    }
  }

  function clear() {
    strokesRef.current = [];
    currentStrokeRef.current = [];
    redrawCanvas();
    setHasDrawn(false);
    onChange('');
    onVectorChange?.(null);
  }

  function undoLastStroke() {
    if (strokesRef.current.length === 0) {
      clear();
      return;
    }

    strokesRef.current = strokesRef.current.slice(0, -1);
    redrawCanvas();
    emitChanges();
  }

  return (
    <div className="space-y-2">
      <div className="h-44 w-full rounded-lg border border-dashed border-border-primary bg-background-primary p-2">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none cursor-crosshair"
          aria-label={ariaLabel}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          onPointerCancel={stopDrawing}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={undoLastStroke}
          disabled={!hasDrawn}
          className="inline-flex items-center gap-1 rounded border border-border-primary px-2 py-1 text-xs text-text-secondary hover:bg-background-tertiary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Undo2 className="h-3 w-3" />
          Undo stroke
        </button>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 rounded border border-border-primary px-2 py-1 text-xs text-text-secondary hover:bg-background-tertiary"
        >
          <RotateCcw className="h-3 w-3" />
          {hasDrawn ? 'Clear signature' : 'Reset'}
        </button>
      </div>
    </div>
  );
}
