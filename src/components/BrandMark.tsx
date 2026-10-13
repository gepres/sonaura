import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/** El anillo-aura con barras del icono, en vectorial para cabeceras y estados vacíos. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="160 160 704 704">
      <Defs>
        <LinearGradient id="aura" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFB547" />
          <Stop offset="0.5" stopColor="#FF4F9A" />
          <Stop offset="1" stopColor="#7C5CFF" />
        </LinearGradient>
        <LinearGradient id="bars" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#FFC66B" />
          <Stop offset="1" stopColor="#FFFFFF" />
        </LinearGradient>
      </Defs>
      <Circle cx={512} cy={512} r={318} fill="none" stroke="url(#aura)" strokeWidth={40} />
      <Rect x={336} y={452} width={48} height={120} rx={24} fill="url(#bars)" />
      <Rect x={412} y={392} width={48} height={240} rx={24} fill="url(#bars)" />
      <Rect x={488} y={322} width={48} height={380} rx={24} fill="url(#bars)" />
      <Rect x={564} y={392} width={48} height={240} rx={24} fill="url(#bars)" />
      <Rect x={640} y={452} width={48} height={120} rx={24} fill="url(#bars)" />
    </Svg>
  );
}
