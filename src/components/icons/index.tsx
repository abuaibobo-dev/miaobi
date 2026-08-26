import React from 'react';
import {
  ButtIcon, PenisIcon, BreastIcon, LegsIcon, LipsIcon,
  FireIcon, HeartIcon, RoseIcon, BookIcon, PenIcon,
  GearIcon, UserIcon, SearchIcon, SendArrowIcon,
  BackIcon, ForwardIcon, DownIcon, CloseIcon, CheckIcon,
  PlusIcon, TrashIcon, SaveIcon, BrainIcon,
} from './AdultIcons';

const C = '#C77D8A';

const iconMap: Record<string, React.FC<any>> = {
  logo: HeartIcon,
  write: PenIcon,
  edit: PenIcon,
  chat: LipsIcon,
  settings: GearIcon,
  back: BackIcon,
  forward: ForwardIcon,
  add: PlusIcon,
  delete: TrashIcon,
  trash: TrashIcon,
  save: SaveIcon,
  search: SearchIcon,
  star: HeartIcon,
  book: BookIcon,
  chapter: BookIcon,
  character: UserIcon,
  idea: FireIcon,
  stats: FireIcon,
  export: SaveIcon,
  backup: SaveIcon,
  test: FireIcon,
  thinking: BrainIcon,
  loading: FireIcon,
  check: CheckIcon,
  close: CloseIcon,
  arrow: SendArrowIcon,
  send: SendArrowIcon,
  autoWrite: PenIcon,
  auto: PenIcon,
  continueWrite: ForwardIcon,
  newChapter: PlusIcon,
  outline: BookIcon,
  preview: HeartIcon,
  modify: PenIcon,
  tts: FireIcon,
  copy: SaveIcon,
  image: HeartIcon,
  menu: PlusIcon,
  more: FireIcon,
  down: DownIcon,
  up: ForwardIcon,
  heart: HeartIcon,
  fire: FireIcon,
  rose: RoseIcon,
  kiss: LipsIcon,
  lock: CloseIcon,
  adult: BreastIcon,
  butt: ButtIcon,
  penis: PenisIcon,
  breast: BreastIcon,
  legs: LegsIcon,
  lips: LipsIcon,
};

export function AdultIcon({ name, size = 24, color = C }: { name: string; size?: number; color?: string }) {
  const IconComponent = iconMap[name] || HeartIcon;
  return <IconComponent size={size} color={color} />;
}

export {
  ButtIcon, PenisIcon, BreastIcon, LegsIcon, LipsIcon,
  FireIcon, HeartIcon, RoseIcon, BookIcon, PenIcon,
  GearIcon, UserIcon, SearchIcon, SendArrowIcon,
  BackIcon, ForwardIcon, DownIcon, CloseIcon, CheckIcon,
  PlusIcon, TrashIcon, SaveIcon, BrainIcon,
};
