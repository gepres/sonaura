import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { Icon, type IconName } from '@/components/Icon';
import { useLibrary } from '@/state/library';
import { useNetwork } from '@/state/network';
import { auraGradient, colors, radius, space, typo } from '@/theme';

type ButtonProps = { label: string; icon?: IconName; onPress: () => void; variant?: 'primary' | 'ghost'; disabled?: boolean };

/** Botón píldora: primario con el degradado de marca, o fantasma. */
export function PillButton({ label, icon, onPress, variant = 'primary', disabled }: ButtonProps) {
  const content = (
    <>
      {icon ? <Icon name={icon} size={18} color={variant === 'primary' ? '#1A0B2E' : colors.text} /> : null}
      <Text style={[styles.pillLabel, variant === 'primary' && styles.pillLabelPrimary]}>{label}</Text>
    </>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.pillOuter, (pressed || disabled) && { opacity: disabled ? 0.4 : 0.85 }]}>
      {variant === 'primary' ? (
        <LinearGradient colors={auraGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pill}>
          {content}
        </LinearGradient>
      ) : (
        <View style={[styles.pill, styles.pillGhost]}>{content}</View>
      )}
    </Pressable>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <BrandMark size={72} />
      <Text style={[typo.subtitle, styles.center]}>{title}</Text>
      <Text style={[typo.caption, styles.center]}>{message}</Text>
      {action}
    </View>
  );
}

/** Aviso cuando no hay conexión o Drive falla; la app sigue con lo guardado. */
export function StatusBanner() {
  const online = useNetwork((s) => s.online);
  const error = useLibrary((s) => s.error);
  if (online && !error) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Icon name="offline" size={16} color={colors.amber} />
      <Text style={styles.bannerText}>
        {online ? error : 'Sin conexión · solo suena lo que descargaste'}
      </Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={typo.overline}>{children.toUpperCase()}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  pillOuter: { borderRadius: radius.pill, overflow: 'hidden' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    height: 44,
    borderRadius: radius.pill,
  },
  pillGhost: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pillLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  pillLabelPrimary: { color: '#1A0B2E' },
  empty: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xxl, paddingVertical: 64 },
  center: { textAlign: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,181,71,0.12)',
  },
  bannerText: { ...typo.caption, color: colors.amber, flex: 1 },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginTop: space.xl,
    marginBottom: space.sm,
  },
});
