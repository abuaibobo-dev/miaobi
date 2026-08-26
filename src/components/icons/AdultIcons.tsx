import React from 'react';
import Svg, { Path, Circle, Ellipse, Rect } from 'react-native-svg';

const C = '#C77D8A';
const CK = '#F0E8EC';

// 🍑 屁股
export const ButtIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Ellipse cx="8" cy="14" rx="5.5" ry="6" fill={color} opacity="0.85" />
    <Ellipse cx="16" cy="14" rx="5.5" ry="6" fill={color} opacity="0.85" />
    <Path d="M12 8 Q12 18 12 18" stroke={color} strokeWidth="1" fill="none" opacity="0.4" />
  </Svg>
);

// 🍆 鸡巴
export const PenisIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="9.5" y="6" width="5" height="12" rx="2.5" fill={color} opacity="0.85" />
    <Circle cx="12" cy="5" r="3.5" fill={color} />
    <Circle cx="12" cy="4.5" r="1.5" fill={color} opacity="0.5" />
  </Svg>
);

// 🍈 胸部
export const BreastIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="8" cy="13" r="5" fill={color} opacity="0.85" />
    <Circle cx="16" cy="13" r="5" fill={color} opacity="0.85" />
    <Circle cx="8" cy="13" r="2" fill={color} opacity="0.4" />
    <Circle cx="16" cy="13" r="2" fill={color} opacity="0.4" />
    <Path d="M6 6 Q12 2 18 6" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
  </Svg>
);

// 🦵 美腿
export const LegsIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M9 2 Q8 10 8 14 Q7 18 8 22" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85" />
    <Path d="M15 2 Q16 10 16 14 Q17 18 16 22" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85" />
  </Svg>
);

// 💋 嘴/逼
export const LipsIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 10 Q8 6 12 10 Q16 6 20 10 Q16 18 12 16 Q8 18 4 10Z" fill={color} opacity="0.85" />
    <Path d="M6 10 Q12 14 18 10" stroke={color} strokeWidth="0.8" fill="none" opacity="0.4" />
  </Svg>
);

// 🔥 火焰
export const FireIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 2 Q14 8 16 10 Q18 14 16 18 Q14 22 12 22 Q10 22 8 18 Q6 14 8 10 Q10 8 12 2Z" fill={color} opacity="0.85" />
    <Path d="M12 10 Q13 14 12 18 Q11 14 12 10Z" fill={color} opacity="0.4" />
  </Svg>
);

// 💕 心
export const HeartIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 21 Q12 21 3 13 Q-1 9 3 5 Q7 1 12 7 Q17 1 21 5 Q25 9 21 13 Q12 21 12 21Z" fill={color} opacity="0.85" />
  </Svg>
);

// 🌹 玫瑰
export const RoseIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="12" cy="9" r="5" fill={color} opacity="0.85" />
    <Circle cx="12" cy="9" r="2.5" fill={color} opacity="0.4" />
    <Path d="M12 14 L12 22" stroke={color} strokeWidth="1.5" fill="none" opacity="0.6" />
    <Path d="M9 17 Q12 15 15 17" stroke={color} strokeWidth="1" fill="none" opacity="0.4" />
  </Svg>
);

// 📖 书
export const BookIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 4 Q4 20 12 20 Q20 20 20 4" stroke={color} strokeWidth="1.5" fill="none" opacity="0.85" />
    <Path d="M12 4 L12 20" stroke={color} strokeWidth="1" opacity="0.4" />
    <Path d="M7 8 L10 8" stroke={color} strokeWidth="1" opacity="0.3" />
    <Path d="M7 11 L10 11" stroke={color} strokeWidth="1" opacity="0.3" />
  </Svg>
);

// ✍️ 写作
export const PenIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 20 L16 8 L18 10 L6 22 Z" fill={color} opacity="0.85" />
    <Path d="M16 8 L18 6 Q20 4 22 6 L20 8 L18 10 Z" fill={color} opacity="0.6" />
  </Svg>
);

// ⚙️ 设置
export const GearIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="12" cy="12" r="3" fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" />
    <Path d="M12 1 L13 4 L15 3 L14 6 L17 6 L15 8 L18 10 L15 10 L16 13 L13 12 L13 15 L11 13 L10 16 L9 13 L7 15 L8 11 L5 10 L8 9 L6 7 L9 7 L8 5 L11 6 L10 3 L12 4 Z" fill={color} opacity="0.6" />
  </Svg>
);

// 👤 用户
export const UserIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="12" cy="8" r="4" fill={color} opacity="0.85" />
    <Path d="M4 22 Q4 16 12 16 Q20 16 20 22" fill={color} opacity="0.6" />
  </Svg>
);

// 🔍 搜索
export const SearchIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="10" cy="10" r="6" fill="none" stroke={color} strokeWidth="2" opacity="0.85" />
    <Path d="M15 15 L21 21" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.85" />
  </Svg>
);

// ⬆️ 发送箭头
export const SendArrowIcon = ({ size = 24, color = '#111' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 4 L12 20 M6 10 L12 4 L18 10" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

// ← 返回
export const BackIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M15 4 L7 12 L15 20" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

// → 前进
export const ForwardIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M9 4 L17 12 L9 20" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

// ▾ 下拉
export const DownIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 9 L12 17 L20 9" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

// ✕ 关闭
export const CloseIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 6 L18 18 M18 6 L6 18" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

// ✓ 勾
export const CheckIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 12 L10 18 L20 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

// ＋ 加号
export const PlusIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 4 L12 20 M4 12 L20 12" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

// 🗑️ 垃圾桶
export const TrashIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 7 L20 7 L19 21 Q19 22 18 22 L6 22 Q5 22 5 21 Z" fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" />
    <Path d="M8 7 L8 4 Q8 3 9 3 L15 3 Q16 3 16 4 L16 7" fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" />
    <Path d="M10 10 L10 18 M14 10 L14 18" stroke={color} strokeWidth="1" opacity="0.5" />
  </Svg>
);

// 💾 保存
export const SaveIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M5 3 L19 3 L19 21 L5 21 Z" fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" />
    <Path d="M8 3 L8 9 L16 9 L16 3" fill="none" stroke={color} strokeWidth="1" opacity="0.5" />
    <Rect x="7" y="14" width="10" height="4" rx="1" fill={color} opacity="0.3" />
  </Svg>
);

// 🧠 大脑
export const BrainIcon = ({ size = 24, color = C }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 22 L12 12" stroke={color} strokeWidth="1" opacity="0.4" />
    <Path d="M8 4 Q4 4 4 8 Q4 12 8 12 L12 12" fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" />
    <Path d="M16 4 Q20 4 20 8 Q20 12 16 12 L12 12" fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" />
    <Path d="M8 7 Q10 6 12 7" stroke={color} strokeWidth="0.8" fill="none" opacity="0.3" />
    <Path d="M8 10 Q10 9 12 10" stroke={color} strokeWidth="0.8" fill="none" opacity="0.3" />
  </Svg>
);
