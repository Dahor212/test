import { memo, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { dinoIconSvg, paletteToIconColors, terrainIconSvg, uiIconSvg } from '../../assets/icons';
import { sound } from '../../audio/sound';
import { DINO_BY_ID, STARTER_LINEUP } from '../../config/dinosaurs';
import { dinoSnapshot } from '../../render/stage';
import { store, useApp } from '../../state/store';
import type { Archetype } from '../../types';

export const Icon = memo(function Icon({ name, size = 28, className, style }: { name: string; size?: number; className?: string; style?: CSSProperties }) {
  return <span className={'icon ' + (className ?? '')} style={{ width: size, height: size, ...style }} dangerouslySetInnerHTML={{ __html: uiIconSvg(name) }} />;
});

export const TerrainIcon = memo(function TerrainIcon({ icon, size = 40 }: { icon: string; size?: number }) {
  return <span className="icon terrain-icon" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: terrainIconSvg(icon) }} />;
});

export const DinoIcon = memo(function DinoIcon({ archetype, defId, size = 56 }: { archetype: Archetype; defId?: string; size?: number }) {
  const def = defId ? DINO_BY_ID[defId] : undefined;
  const palette = def?.palette ?? DINO_BY_ID[STARTER_LINEUP[archetype]].palette;
  return <span className="icon dino-icon" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: dinoIconSvg(archetype, paletteToIconColors(palette)) }} />;
});

/** 3D-rendered thumbnail of a dinosaur (cached). */
export function DinoThumb({ defId, accessory = null, size = 140, locked = false }: { defId: string; accessory?: string | null; size?: number; locked?: boolean }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    let alive = true;
    // render after paint so screens appear instantly
    const t = window.setTimeout(() => alive && setUrl(dinoSnapshot(defId, accessory, 256)), 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [defId, accessory]);
  const def = DINO_BY_ID[defId];
  return (
    <div className={'dino-thumb' + (locked ? ' locked' : '')} style={{ width: size, height: size }}>
      {url ? <img src={url} alt={def?.name ?? ''} draggable={false} /> : def ? <DinoIcon archetype={def.archetype} defId={defId} size={size * 0.8} /> : null}
      {locked && <Icon name="lock" size={size * 0.3} className="thumb-lock" />}
    </div>
  );
}

export function Button({
  children,
  onClick,
  color = 'green',
  size = 'md',
  disabled,
  className,
  icon,
  testId,
}: {
  children?: ReactNode;
  onClick?: () => void;
  color?: 'green' | 'orange' | 'blue' | 'purple' | 'yellow' | 'red' | 'white' | 'teal';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  disabled?: boolean;
  className?: string;
  icon?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      className={`btn btn-${color} btn-${size} ${className ?? ''}`}
      disabled={disabled}
      onClick={() => {
        sound.unlock();
        sound.play('tap');
        onClick?.();
      }}
    >
      {icon && <Icon name={icon} size={size === 'xl' ? 44 : size === 'lg' ? 34 : size === 'sm' ? 20 : 26} />}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

export function CoinCounter({ big }: { big?: boolean }) {
  const coins = useApp((s) => s.profile.coins);
  return (
    <div className={'coin-counter' + (big ? ' big' : '')} data-testid="coin-counter">
      <Icon name="coin" size={big ? 36 : 28} />
      <span>{coins}</span>
    </div>
  );
}

export function TopBar({ title, onBack, right, icon }: { title: string; onBack?: () => void; right?: ReactNode; icon?: string }) {
  return (
    <header className="topbar">
      <Button color="white" size="sm" icon="back" onClick={onBack ?? (() => store.go('MENU'))} className="back-btn" testId="back" />
      <h1>
        {icon && <Icon name={icon} size={34} />}
        {title}
      </h1>
      <div className="topbar-right">{right ?? <CoinCounter />}</div>
    </header>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal">{children}</div>
    </div>
  );
}

export function Stars({ count, max = 3, size = 30 }: { count: number; max?: number; size?: number }) {
  return (
    <div className="stars">
      {Array.from({ length: max }, (_, i) => (
        <Icon key={i} name="star" size={size} className={i < count ? 'star-on' : 'star-off'} />
      ))}
    </div>
  );
}

export function ProgressBar({ value, color = '#4cd137', label }: { value: number; color?: string; label?: string }) {
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
      {label && <span className="progress-label">{label}</span>}
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <Icon name={t.icon} size={30} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export function formatTime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '–';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
