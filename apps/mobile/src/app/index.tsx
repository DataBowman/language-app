import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useSession } from '@/auth/session';
import { useT } from '@/i18n';
import { Body, Button, Screen } from '@/ui/components';

export default function Index() {
  const { state, signOut } = useSession();
  const t = useT();

  if (state.status === 'loading')
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  if (state.status === 'signed_out') return <Redirect href="/sign-in" />;
  if (state.role === 'student') return <Redirect href="/student" />;
  if (state.role === 'tutor') return <Redirect href="/tutor" />;
  return (
    <Screen>
      <Body>{t.noRole}</Body>
      <Button label={t.signOut} variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
