import { router } from 'expo-router';

import { useSession } from '@/auth/session';
import { useT } from '@/i18n';
import { Button, Card, Screen, Title } from '@/ui/components';

export default function StudentHome() {
  const t = useT();
  const { signOut } = useSession();
  return (
    <Screen>
      <Title>{t.studentHome}</Title>
      <Card title={t.quickTitle} subtitle={t.quickSubtitle} onPress={() => router.push('/student/quick')} />
      <Card title={t.deepTitle} subtitle={t.deepSubtitle} onPress={() => router.push('/student/immersive')} />
      <Button label={t.signOut} variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
