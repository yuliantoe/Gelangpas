import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCanvasProps {
  value: string;
  size?: number;
  darkColor?: string;
  lightColor?: string;
  className?: string;
}

export const QrCanvas: React.FC<QrCanvasProps> = ({
  value,
  size = 128,
  darkColor = '#0F172A',
  lightColor = '#FFFFFF',
  className = '',
}) => {
  const [svgMarkup, setSvgMarkup] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toString(value || 'EMPTY', {
      type: 'svg',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: darkColor,
        light: lightColor,
      },
    })
      .then((svg) => {
        if (active) setSvgMarkup(svg);
      })
      .catch(() => {
        if (active) setSvgMarkup('');
      });

    return () => {
      active = false;
    };
  }, [value, size, darkColor, lightColor]);

  return (
    <div
      className={`inline-flex items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
      aria-label="Kode QR Gelang Terenkripsi"
    />
  );
};
