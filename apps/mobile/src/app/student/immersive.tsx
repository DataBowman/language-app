import { router } from 'expo-router';

import { LocaleScope, useT } from '@/i18n';
import { Body, Button, Screen, Title } from '@/ui/components';

function Immersive() {
  const t = useT();
  return (
    <Screen>
      <Title>{t.deepTitle}</Title>
      <Body muted>{t.deepSubtitle}</Body>
      <Body>Las lecciones inmersivas llegan en la fase 1.</Body>
      <Button label={t.back} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

/** Immersive mode switches the whole interface to Spanish (ADR 0007). */
export default function ImmersiveSession() {
  return (
    <LocaleScope locale="es">
      <Immersive />
    </LocaleScope>
  );
}
