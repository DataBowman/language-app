import { EXERCISE_TYPE_INFO, typesForMode } from '@language-app/core';
import { router } from 'expo-router';

import { useT } from '@/i18n';
import { Body, Button, Card, Screen, Title } from '@/ui/components';

export default function QuickSession() {
  const t = useT();
  return (
    <Screen>
      <Title>{t.quickTitle}</Title>
      <Body muted>{t.quickComing}</Body>
      {typesForMode('quick').map((type) => (
        <Card key={type} title={type} subtitle={EXERCISE_TYPE_INFO[type].description} />
      ))}
      <Button label={t.back} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
