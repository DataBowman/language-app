import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { maxContentWidth, space, useColors } from './theme';

export function Screen({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={[styles.title, { color: useColors().text }]} accessibilityRole="header">{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const c = useColors();
  return <Text style={[styles.body, { color: muted ? c.muted : c.text }]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={[styles.body, { color: useColors().danger }]} accessibilityRole="alert">{children}</Text>;
}

export function Button({ label, onPress, busy, variant = 'primary' }: { label: string; onPress: () => void; busy?: boolean; variant?: 'primary' | 'secondary' }) {
  const c = useColors();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: primary ? c.primary : c.surface, opacity: pressed || busy ? 0.7 : 1 }]}>
      {busy ? <ActivityIndicator color={primary ? c.onPrimary : c.text} /> : <Text style={[styles.buttonText, { color: primary ? c.onPrimary : c.text }]}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ title, subtitle, onPress }: { title: string; subtitle: string; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}>
      <Text style={[styles.cardTitle, { color: c.text }]}>{title}</Text>
      <Text style={[styles.body, { color: c.muted }]}>{subtitle}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const c = useColors();
  const { label, ...rest } = props;
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[styles.body, { color: c.muted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', padding: space.md },
  column: { width: '100%', maxWidth: maxContentWidth, gap: space.md },
  title: { fontSize: 28, fontWeight: '700', marginTop: space.md },
  body: { fontSize: 16, lineHeight: 22 },
  button: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  buttonText: { fontSize: 16, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 16, padding: space.lg, gap: space.sm },
  cardTitle: { fontSize: 20, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: space.md, fontSize: 16 },
});
