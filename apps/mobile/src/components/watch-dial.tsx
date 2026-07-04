import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';
import { Brand } from '@/constants/theme';

type WatchDialProps = {
  size?: number;
};

/**
 * Cadran placeholder du handoff : disque métallique clair (radial
 * #fbfcfd→#c4ccd6), aiguilles à 10h10, point d'axe accent.
 */
export function WatchDial({ size = 44 }: WatchDialProps) {
  const c = size / 2;
  const r = c - 1;

  const hourAngle = (-50 * Math.PI) / 180;
  const minuteAngle = (60 * Math.PI) / 180;
  const hourLen = r * 0.42;
  const minuteLen = r * 0.62;
  const hands = 'rgba(27,37,49,0.55)';

  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="dial-metal" cx="38%" cy="30%" r="74%">
          <Stop offset="0%" stopColor={Brand.dialLight} />
          <Stop offset="100%" stopColor={Brand.dialDark} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={r} fill="url(#dial-metal)" stroke={Brand.dialBorder} strokeWidth={1} />
      <Line
        x1={c}
        y1={c}
        x2={c + hourLen * Math.cos(hourAngle - Math.PI / 2)}
        y2={c + hourLen * Math.sin(hourAngle - Math.PI / 2)}
        stroke={hands}
        strokeWidth={size * 0.035}
        strokeLinecap="round"
      />
      <Line
        x1={c}
        y1={c}
        x2={c + minuteLen * Math.cos(minuteAngle - Math.PI / 2)}
        y2={c + minuteLen * Math.sin(minuteAngle - Math.PI / 2)}
        stroke={hands}
        strokeWidth={size * 0.028}
        strokeLinecap="round"
      />
      <Circle cx={c} cy={c} r={size * 0.055} fill={Brand.accent} />
    </Svg>
  );
}
