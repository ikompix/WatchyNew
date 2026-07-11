import Svg, { Circle, Path } from 'react-native-svg';
import { Brand } from '@/constants/theme';

type WatchyMarkProps = {
  width?: number;
};

/**
 * Marque Watchy du handoff v3 : trois cadrans empilés, aiguilles sur le
 * cadran avant. Séparations blanches opaques → fond clair uniquement.
 */
export function WatchyMark({ width = 72 }: WatchyMarkProps) {
  const height = (width * 64) / 72;

  return (
    <Svg width={width} height={height} viewBox="0 0 72 64">
      <Circle cx={22} cy={32} r={15} fill={Brand.logoBack} />
      <Circle cx={36} cy={32} r={16.5} fill="#FFFFFF" />
      <Circle cx={36} cy={32} r={15} fill={Brand.logoMid} />
      <Circle cx={50} cy={32} r={16.5} fill="#FFFFFF" />
      <Circle cx={50} cy={32} r={15} fill={Brand.logoFront} />
      <Path d="M50 32 L50 23" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" />
      <Path d="M50 32 L57 34.5" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" />
    </Svg>
  );
}
