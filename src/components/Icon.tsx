import { useId, type ReactNode } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export type IconName =
  | 'archive'
  | 'undo'
  | 'hourglass'
  | 'flag'
  | 'bolt'
  | 'stars'
  | 'calendar'
  | 'people'
  | 'person'
  | 'bell'
  | 'sliders'
  | 'import'
  | 'plus'
  | 'phone'
  | 'send'
  | 'bubble'
  | 'bubble2'
  | 'pencil'
  | 'chevronRight'
  | 'chevronLeft'
  | 'chevronDown'
  | 'redDay'
  | 'chevronUp'
  | 'check'
  | 'cake'
  | 'heart'
  | 'flower'
  | 'food'
  | 'gift'
  | 'note'
  | 'repeat'
  | 'clock'
  | 'search'
  | 'close'
  | 'trash'
  | 'moon'
  | 'sun'
  | 'info'
  | 'warning'
  | 'lock'
  | 'qr'
  | 'flask'
  | 'share'
  | 'refresh'
  | 'palette'
  | 'list'
  | 'book'
  | 'camera'
  | 'star'
  | 'bellOff'
  | 'minus'
  | 'globe'
  | 'link'
  | 'open'
  | 'copy';

const PATHS: Record<IconName, ReactNode> = {
  calendar: (
    <>
      <Rect x={3} y={5} width={18} height={16} rx={3} />
      <Path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  people: (
    <>
      <Circle cx={9} cy={8} r={3.5} />
      <Path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6 6 0 0 0-4-5.6" />
    </>
  ),
  person: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  bell: <Path d="M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3zM10 20a2 2 0 0 0 4 0" />,
  sliders: (
    <>
      <Path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
      <Circle cx={16} cy={7} r={2.5} />
      <Circle cx={10} cy={17} r={2.5} />
    </>
  ),
  import: <Path d="M12 4v11M7 10l5 5 5-5M4 20h16" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  phone: <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  send: <Path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" />,
  bubble: <Path d="M21 12a8 8 0 0 1-11.7 7.1L4 21l1.9-5.3A8 8 0 1 1 21 12z" />,
  bubble2: <Path d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-6l-4 4v-4H7a3 3 0 0 1-3-3z" />,
  pencil: (
    <>
      <Path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <Path d="M13 8l3 3" />
    </>
  ),
  chevronRight: <Path d="M9 6l6 6-6 6" />,
  chevronLeft: <Path d="M15 6l-6 6 6 6" />,
  chevronDown: <Path d="M6 9l6 6 6-6" />,
  // «Красный день календаря» — листок с точкой: праздник в списке дня.
  redDay: (
    <>
      <Rect x={4} y={5} width={16} height={15} rx={2.5} />
      <Path d="M4 10h16M8.5 3v4M15.5 3v4" />
      <Circle cx={12} cy={15} r={1.6} />
    </>
  ),
  chevronUp: <Path d="M6 15l6-6 6 6" />,
  check: <Path d="M5 12l5 5 9-10" />,
  cake: (
    // Свеча с пламенем: и на торт похоже, и рисунок стоит по центру квадрата (без пламени он сидел ниже).
    <Path d="M4 21h16M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7M5 16.5c1.2 0 1.2 1 2.4 1s1.1-1 2.3-1 1.2 1 2.3 1 1.2-1 2.3-1 1.2 1 2.4 1 1.1-1 2.3-1M12 12V8M12 5.4c.75-.8.75-1.8 0-2.6-.75.8-.75 1.8 0 2.6z" />
  ),
  heart: <Path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  flower: (
    <>
      <Circle cx={12} cy={12} r={2} />
      <Circle cx={12} cy={6.5} r={2.8} />
      <Circle cx={12} cy={17.5} r={2.8} />
      <Circle cx={6.5} cy={12} r={2.8} />
      <Circle cx={17.5} cy={12} r={2.8} />
    </>
  ),
  food: <Path d="M6 3v7a2 2 0 0 0 4 0V3M8 12v9M17 3c-2 0-3 3.5-3 7 0 1.5 1 2 2 2h1v9" />,
  gift: (
    <>
      <Rect x={3} y={8} width={18} height={4} rx={1} />
      <Path d="M12 8v13M5 12v9h14v-9M12 8c-2 0-5-1-5-3a2 2 0 0 1 4-1l1 4M12 8c2 0 5-1 5-3a2 2 0 0 0-4-1l-1 4" />
    </>
  ),
  note: (
    <>
      <Path d="M5 4h10l4 4v12H5z" />
      <Path d="M15 4v4h4M8 13h8M8 17h5" />
    </>
  ),
  repeat: (
    <>
      <Path d="M17 2l4 4-4 4" />
      <Path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" />
      <Path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  clock: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  undo: (
    <>
      <Path d="M9 14 4 9l5-5" />
      <Path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  hourglass: <Path d="M7 3h10M7 21h10M8 3c0 4 8 5 8 9s-8 5-8 9M16 3c0 4-8 5-8 9s8 5 8 9" />,
  flag: <Path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  bolt: <Path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />,
  search: (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Path d="M20 20l-4-4" />
    </>
  ),
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  trash: <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  moon: <Path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  sun: (
    <>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  info: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 11v5M12 8v.5" />
    </>
  ),
  warning: <Path d="M12 3 2 20h20zM12 10v4M12 17v.5" />,
  lock: (
    <>
      <Rect x={5} y={11} width={14} height={10} rx={2} />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  qr: (
    <>
      <Rect x={3} y={3} width={7} height={7} rx={1} />
      <Rect x={14} y={3} width={7} height={7} rx={1} />
      <Rect x={3} y={14} width={7} height={7} rx={1} />
      <Path d="M14 14h3v3M21 14v3h-3M14 21h3M21 21v-1" />
    </>
  ),
  flask: <Path d="M9 3h6M10 3v6l-5.5 9a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3" />,
  share: (
    <>
      <Path d="M12 3v12M8 7l4-4 4 4" />
      <Path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </>
  ),
  refresh: (
    <>
      <Path d="M20 12a8 8 0 0 1-14.5 4.6M4 12a8 8 0 0 1 14.5-4.6" />
      <Path d="M20 4v4h-4M4 20v-4h4" />
    </>
  ),
  palette: (
    <>
      <Path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.4-3.4 2 2 0 0 1 1.4-3.4H18a3 3 0 0 0 3-3c0-4.4-4-8.2-9-8.2z" />
      <Circle cx={7.5} cy={11} r={1} />
      <Circle cx={10.5} cy={7} r={1} />
      <Circle cx={15.5} cy={7.5} r={1} />
    </>
  ),
  list: <Path d="M8 6h13M8 12h13M8 18h13M3 6h.5M3 12h.5M3 18h.5" />,
  book: <Path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z" />,
  camera: (
    <>
      <Path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <Circle cx={12} cy={13} r={3.5} />
    </>
  ),
  bellOff: (
    <>
      <Path d="M8.6 5.2A6 6 0 0 1 18 10v4l2 3h-5M6 10v4l-2 3h11M10 20a2 2 0 0 0 4 0" />
      <Path d="M3 3l18 18" />
    </>
  ),
  minus: <Path d="M6 12h12" />,
  star: <Path d="M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.6l-5.1 2.8 1.1-5.8-4.3-4 5.8-.7z" />,
  globe: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  link: <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  open: <Path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />,
  copy: (
    <>
      <Rect x={9} y={9} width={11} height={11} rx={2} />
      <Path d="M5 15V5a1 1 0 0 1 1-1h10" />
    </>
  ),
  stars: (
    <>
      <Path d="M5.5 17.5L9 9.5l6 3 3.5-7" strokeWidth={1.2} />
      <Circle cx={5.5} cy={17.5} r={1.7} />
      <Circle cx={9} cy={9.5} r={1.7} />
      <Circle cx={15} cy={12.5} r={1.7} />
      <Circle cx={18.5} cy={5.5} r={1.7} />
    </>
  ),
  archive: (
    <>
      <Rect x={3} y={4} width={18} height={5} rx={1.5} />
      <Path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
    </>
  ),
};

/** Иконки одной линии (1.75 px) — вместо эмодзи. `fill` — для «включённых» состояний, например закрашенной звезды. */
export function Icon({
  name,
  size = 22,
  color = '#221C18',
  strokeWidth = 1.75,
  fill = 'none',
  gradient,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  /** Линия градиентом — слева сверху вправо вниз (значок дня рождения в календаре). */
  gradient?: readonly string[];
}) {
  const id = 'ig' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      color={color}
      fill={fill}
      stroke={gradient ? `url(#${id})` : color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {gradient && (
        <Defs>
          <LinearGradient id={id} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
            {gradient.map((c, i) => (
              <Stop key={i} offset={i / Math.max(1, gradient.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
      )}
      {PATHS[name]}
    </Svg>
  );
}
