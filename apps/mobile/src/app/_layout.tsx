import { Stack } from 'expo-router';

import { SessionProvider, useSession } from '@/auth/session';
import { LocaleScope } from '@/i18n';

function RootStack() {
  const { state } = useSession();
  const role = state.status === 'signed_in' ? state.role : null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={state.status === 'signed_out'}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      {/* Role routing is UX only; the real access control is Row Level Security on the server. */}
      <Stack.Protected guard={role === 'student'}>
        <Stack.Screen name="student" />
      </Stack.Protected>
      <Stack.Protected guard={role === 'tutor'}>
        <Stack.Screen name="tutor" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <LocaleScope locale="en">
        <RootStack />
      </LocaleScope>
    </SessionProvider>
  );
}
