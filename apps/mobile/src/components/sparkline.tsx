import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Brand } from '@/constants/theme';

type SparklineProps = {
  /** Série chronologique (du plus ancien au plus récent) */
  values: number[];
  width?: number;
  height?: number;
  /** Couleur du trait — par défaut vert/orange selon la tendance */
  color?: string;
  strokeWidth?: number;
  /** Remplir l'aire sous la courbe (carte valeur totale, détail de cote) */
  area?: boolean;
  /** Marquer le dernier point */
  endDot?: boolean;
};

function buildPath(values: number[], width: number, height: number, pad: number): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerH = height - pad * 2;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = i * step;
      const y = pad + innerH * (1 - (v - min) / range);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function Sparkline({
  values,
  width = 40,
  height = 20,
  color,
  strokeWidth = 1.6,
  area = false,
  endDot = false,
}: SparklineProps) {
  if (values.length < 2) return null;

  const trendUp = values[values.length - 1] >= values[0];
  const stroke = color ?? (trendUp ? Brand.positive : Brand.negative);
  const pad = Math.max(strokeWidth, endDot ? 3 : 0) + 1;
  const line = buildPath(values, width, height, pad);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const lastX = width;
  const lastY = pad + (height - pad * 2) * (1 - (values[values.length - 1] - min) / range);

  return (
    <Svg width={width} height={height}>
      {area ? (
        <>
          <Defs>
            <LinearGradient id="spark-area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
              <Stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Path d={`${line} L${width},${height} L0,${height} Z`} fill="url(#spark-area)" />
        </>
      ) : null}
      <Path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {endDot ? <Circle cx={lastX - 2} cy={lastY} r={3} fill={stroke} /> : null}
    </Svg>
  );
}
